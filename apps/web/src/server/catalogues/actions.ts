"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
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
import { getAIProvider } from "../ai/provider";
import { readImage } from "../storage";
import { tryMatchPromotionProduct } from "../ingestion/promotions";
import { candidatesFromExtraction, type CatalogueCandidate } from "./extraction";

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
export async function extractPageAction(pageId: string): Promise<{
  ok: boolean;
  error?: string;
  candidates?: CatalogueCandidate[];
}> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const provider = getAIProvider();
  if (!provider.configured) return { ok: false, error: "ai-not-configured" };

  const pageRow = (
    await db
      .select({ page: cataloguePage, cat: catalogue })
      .from(cataloguePage)
      .innerJoin(catalogue, eq(cataloguePage.catalogueId, catalogue.id))
      .where(eq(cataloguePage.id, pageId))
      .limit(1)
  )[0];
  if (!pageRow?.page.imageKey) return { ok: false, error: "page-not-found" };

  let buffer: Buffer;
  try {
    buffer = await readImage(pageRow.page.imageKey);
  } catch {
    return { ok: false, error: "image-unreadable" };
  }
  const mime = pageRow.page.imageKey.endsWith(".png") ? "image/png" : pageRow.page.imageKey.endsWith(".webp") ? "image/webp" : "image/jpeg";

  let raw;
  try {
    raw = await provider.analyzeImage({
      system:
        "You read supermarket leaflet pages for a grocery app. Extract every priced offer you can SEE. " +
        "promoPrice/regularPrice are euro amounts printed on the page (numbers only, e.g. 4.99). " +
        "mechanicPhrase is the verbatim French deal phrase if printed (\"le lot de 2\", \"2e à -50%\", \"-30%\", \"prix carte\"). " +
        "Do NOT invent prices for unpriced items. Answer with JSON only: " +
        '{"items":[{"description","brand","promoPrice","regularPrice","pricePerKg","mechanicPhrase","loyalty","position"}]}',
      prompt: "Extract the offers from this leaflet page.",
      imageDataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      schema: z.object({ items: z.array(z.unknown()) }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "ai-failed" };
  }

  const candidates = candidatesFromExtraction(raw);
  await db.insert(aiExtraction).values({
    kind: "catalogue_page",
    userId: session.userId,
    // Evidence is linked to the page photo via its storageKey (set at upload).
    model: process.env.ZAI_VISION_MODEL ?? "glm-5.3-flash",
    promptVersion: "catalogue-v1",
    output: { pageId, items: candidates },
    validationStatus: candidates.length > 0 ? "valid" : "rejected",
  });
  await db.update(cataloguePage).set({ processedAt: new Date() }).where(eq(cataloguePage.id, pageId));
  return { ok: true, candidates };
}

/** Latest extraction candidates for a page (persists across reloads). */
export async function getPageCandidates(pageId: string): Promise<CatalogueCandidate[]> {
  const rows = await db
    .select()
    .from(aiExtraction)
    .where(eq(aiExtraction.kind, "catalogue_page"))
    .orderBy(desc(aiExtraction.createdAt))
    .limit(50);
  const row = rows.find((r) => {
    const out = r.output as { pageId?: string } | null;
    return out?.pageId === pageId;
  });
  if (!row) return [];
  const out = row.output as { items?: CatalogueCandidate[] } | null;
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
  loyalty: z.boolean(),
  validUntil: z.string().regex(dateRegex),
});

/** User confirms a candidate → it becomes a real promotion with photo evidence. */
export async function confirmCandidateAction(input: unknown): Promise<{ ok: boolean; error?: string; promotionId?: string }> {
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
