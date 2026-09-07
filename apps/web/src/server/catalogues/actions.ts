"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  aiExtraction,
  catalogue,
  cataloguePage,
  promotion,
  retailer,
  shoppingItem,
  shoppingPlan,
  sourceEvidence,
  store,
  userStorePrefs,
} from "@maqrivo/db";
import { getSessionContext } from "../session";
import { tryMatchPromotionProduct } from "../ingestion/promotions";
import { runPageExtraction, type ExtractPageResult } from "./extraction-runner";
import type { CatalogueCandidate } from "./extraction";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export async function createCatalogueAction(input: {
  retailerSlug: string;
  title?: string;
  validFrom?: string;
  validUntil?: string;
  storeId?: string;
}): Promise<{ ok: boolean; error?: string; catalogueId?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  if (input.validUntil && !dateRegex.test(input.validUntil)) return { ok: false, error: "invalid-dates" };

  const retailerRow = (await db.select().from(retailer).where(eq(retailer.slug, input.retailerSlug)).limit(1))[0];
  if (!retailerRow) return { ok: false, error: "unknown-retailer" };

  const inserted = (
    await db
      .insert(catalogue)
      .values({
        retailerId: retailerRow.id,
        storeId: input.storeId ?? null,
        title: input.title ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
      })
      .returning()
  )[0]!;
  revalidatePath("/offers");
  return { ok: true, catalogueId: inserted.id };
}

/** Vision extraction over one page photo → reviewed candidates (never auto-truth). */
export async function extractPageAction(pageId: string): Promise<ExtractPageResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  return runPageExtraction({ pageId, userId: session.userId });
}

/**
 * Latest extraction candidates for a page (persists across reloads).
 * `null` = the page was never extracted; `[]` = extraction ran and found
 * nothing (the row is stored even for empty results).
 */
export async function getPageCandidates(pageId: string): Promise<CatalogueCandidate[] | null> {
  const rows = await db
    .select()
    .from(aiExtraction)
    .where(
      and(
        eq(aiExtraction.kind, "catalogue_page"),
        // jsonb filter — no dedicated index, but the kind index narrows the scan.
        sql`${aiExtraction.output}->>'pageId' = ${pageId}`,
      ),
    )
    .orderBy(desc(aiExtraction.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const out = row.output as { items?: CatalogueCandidate[]; error?: string } | null;
  // Failed attempts persist a row for the sweep's retry cadence but carry no
  // candidates — treat them like "never extracted" here.
  if (out?.error) return null;
  return out?.items ?? [];
}

const confirmSchema = z.object({
  catalogueId: z.uuid(),
  pageId: z.uuid(),
  description: z.string().min(2).max(200),
  brand: z.string().max(80).nullable(),
  mechanism: z.enum(["PROMO_PRICE", "PERCENTAGE_OFF", "MULTIBUY", "SECOND_UNIT_DISCOUNT", "LOYALTY_PRICE", "OTHER"]),
  promoPriceCents: z.number().int().positive().nullable(),
  regularPriceCents: z.number().int().positive().nullable(),
  pricePerKgCents: z.number().int().positive().nullable(),
  bundleQty: z.number().int().positive().nullable(),
  discountPct: z.number().int().min(1).max(100).nullable(),
  loyalty: z.boolean(),
  validUntil: z.string().regex(dateRegex),
});

/** User confirms a candidate → it becomes a real promotion with photo evidence. */
export async function confirmCandidateAction(input: unknown): Promise<{ ok: boolean; error?: string; promotionId?: string; duplicate?: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;

  const catRow = (
    await db
      .select({ cat: catalogue, page: cataloguePage })
      .from(catalogue)
      .leftJoin(cataloguePage, eq(cataloguePage.id, d.pageId))
      .where(eq(catalogue.id, d.catalogueId))
      .limit(1)
  )[0];
  if (!catRow) return { ok: false, error: "catalogue-not-found" };
  if (d.promoPriceCents === null && d.regularPriceCents === null && d.pricePerKgCents === null) {
    return { ok: false, error: "price-required" };
  }

  // Natural-key dedup (page + description + price): a double-tap, a
  // re-extraction or a confirm-all after reload must not insert twice.
  // Treated as success by the client — idempotent confirm.
  const duplicate = (
    await db
      .select({ id: promotion.id })
      .from(promotion)
      .where(
        and(
          eq(promotion.cataloguePageId, d.pageId),
          eq(promotion.descriptionRaw, d.description),
          d.promoPriceCents != null ? eq(promotion.promoPriceCents, d.promoPriceCents) : isNull(promotion.promoPriceCents),
        ),
      )
      .limit(1)
  )[0];
  if (duplicate) return { ok: true, promotionId: duplicate.id, duplicate: true };

  // Evidence: the page photo itself, resolved via its storageKey
  // (set at upload or sync).
  const evidence = catRow.page?.imageKey
    ? (await db.select().from(sourceEvidence).where(eq(sourceEvidence.storageKey, catRow.page.imageKey)).limit(1))[0]
    : undefined;

  const inserted = (
    await db
      .insert(promotion)
      .values({
        retailerId: catRow.cat.retailerId,
        catalogueId: catRow.cat.id,
        storeId: catRow.cat.storeId ?? null,
        descriptionRaw: d.description,
        brand: d.brand ?? null,
        regularPriceCents: d.regularPriceCents ?? null,
        promoPriceCents: d.promoPriceCents ?? null,
        pricePerKgCents: d.pricePerKgCents ?? null,
        mechanism: d.mechanism === "OTHER" ? "PROMO_PRICE" : d.mechanism,
        minQty: d.bundleQty ?? null,
        discountPct: d.discountPct ?? null,
        payQty: d.bundleQty ?? null,
        loyaltyRequired: d.loyalty,
        validFrom: catRow.cat.validFrom ?? null,
        validUntil: d.validUntil,
        source: "catalogue",
        verification: "EXTRACTED", // extracted from the leaflet, confirmed by the user
        confidence: "HIGH",
        cataloguePageId: catRow.page?.id ?? null,
        evidenceId: evidence?.id ?? null,
        createdByUserId: session.userId,
      })
      .returning()
  )[0]!;

  // Deterministic product match on the confirmed description — same rule
  // path as manual promotions. UNRESOLVED is a valid outcome.
  await tryMatchPromotionProduct(inserted.id, null, d.brand ?? null, d.description);

  revalidatePath("/offers");
  revalidatePath(`/offers/catalogues/${d.catalogueId}`);
  return { ok: true, promotionId: inserted.id };
}

/** Add a confirmed deal straight into the active shopping plan. */
export async function addToBasketAction(promotionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const promo = (await db.select().from(promotion).where(eq(promotion.id, promotionId)).limit(1))[0];
  if (!promo) return { ok: false, error: "promotion-not-found" };
  const today = new Date().toISOString().slice(0, 10);
  if (promo.verification === "EXPIRED" || (promo.validUntil && promo.validUntil < today)) {
    return { ok: false, error: "promotion-expired" };
  }

  let plan = (
    await db
      .select()
      .from(shoppingPlan)
      .where(and(eq(shoppingPlan.userId, session.userId), eq(shoppingPlan.status, "active")))
      .orderBy(desc(shoppingPlan.createdAt))
      .limit(1)
  )[0];
  if (!plan) {
    plan = (
      await db.insert(shoppingPlan).values({ userId: session.userId, objective: "BALANCED", totalCents: 0 }).returning()
    )[0]!;
  }

  // Store: promotion store → nearest enabled store of that retailer → nearest enabled.
  const storeId = await resolveStore(promo.storeId, promo.retailerId, session.userId);
  if (!storeId) return { ok: false, error: "no-enabled-store" };

  const unitCents = promo.promoPriceCents ?? promo.regularPriceCents ?? promo.pricePerKgCents ?? 0;
  await db.insert(shoppingItem).values({
    shoppingPlanId: plan.id,
    storeId,
    productId: null,
    label: promo.descriptionRaw,
    source: "catalogue",
    requiredQuantity: "1",
    requiredUnit: "unit",
    purchaseQuantity: "1",
    packageCount: 1,
    priceBasis: promo.pricePerKgCents && !promo.promoPriceCents ? "per_kg" : "unit",
    unitPriceCents: unitCents,
    effectiveCostCents: unitCents,
    appliedPromotionId: promo.id,
    reasons: [{ code: "FROM_CATALOGUE" }],
    priceFreshness: "fresh",
  });

  await recomputeTotal(plan.id);
  revalidatePath("/shopping");
  return { ok: true };
}

async function resolveStore(
  promotionStoreId: string | null,
  retailerId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ store: store, prefs: userStorePrefs })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .where(and(eq(userStorePrefs.userId, userId), eq(userStorePrefs.enabled, true)));
  const usable = rows.filter((r) => !r.prefs.avoided);
  if (usable.length === 0) return null;
  if (promotionStoreId && usable.some((r) => r.store.id === promotionStoreId)) return promotionStoreId;
  const ofRetailer = usable.filter((r) => r.store.retailerId === retailerId);
  const pool = ofRetailer.length > 0 ? ofRetailer : usable;
  // Nearest by recorded distance (ties broken deterministically by id).
  pool.sort((a, b) => (a.prefs.distanceM ?? 0) - (b.prefs.distanceM ?? 0) || a.store.id.localeCompare(b.store.id));
  return pool[0]!.store.id;
}

export async function recomputeTotal(planId: string): Promise<void> {
  const items = await db.select().from(shoppingItem).where(eq(shoppingItem.shoppingPlanId, planId));
  const active = items.filter((i) => i.status !== "skipped");
  const total = active.reduce((sum, i) => sum + i.effectiveCostCents, 0);
  await db.update(shoppingPlan).set({ totalCents: total }).where(eq(shoppingPlan.id, planId));
}
