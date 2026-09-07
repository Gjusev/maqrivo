/**
 * Promotion service: manual creation through the same normalized model as
 * ingested promotions, plus the daily expiry sweep.
 */
import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { ingestionRun, product, promotion, promotionProductMatch, retailer, store, userStorePrefs } from "@maqrivo/db";
import { getSessionContext } from "../session";
import { resolveProduct, type ProductCandidate, type ExternalProductRef } from "@maqrivo/core";
import { type OffersScope } from "./offers-scope";

export const manualPromotionSchema = z.object({
  retailerSlug: z.string().min(2).max(40),
  storeId: z.uuid().optional(),
  description: z.string().min(3).max(300),
  brand: z.string().max(120).optional(),
  barcode: z.string().regex(/^\d{6,14}$/).optional().or(z.literal("")),
  packageQuantity: z.number().positive().optional(),
  packageUnit: z.string().max(8).optional(),
  regularPriceCents: z.number().int().positive().optional(),
  mechanism: z.enum([
    "PROMO_PRICE",
    "PERCENTAGE_OFF",
    "MULTIBUY",
    "BUY_X_GET_Y",
    "SECOND_UNIT_DISCOUNT",
    "LOYALTY_PRICE",
    "LOYALTY_CREDIT",
    "CASHBACK",
    "COUPON",
    "CATEGORY_PROMO",
  ]),
  promoPriceCents: z.number().int().positive().optional(),
  bundleQty: z.number().int().positive().optional(),
  bundlePriceCents: z.number().int().positive().optional(),
  buyQty: z.number().int().positive().optional(),
  freeQty: z.number().int().positive().optional(),
  discountPct: z.number().int().min(1).max(100).optional(),
  loyaltyRequired: z.boolean().default(false),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(300).optional(),
});

export async function createManualPromotion(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = manualPromotionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const d = parsed.data;

  const retailerRow = (
    await db.select().from(retailer).where(eq(retailer.slug, d.retailerSlug)).limit(1)
  )[0];
  if (!retailerRow) return { ok: false, error: "unknown-retailer" };

  const inserted = (
    await db
      .insert(promotion)
      .values({
        retailerId: retailerRow.id,
        storeId: d.storeId ?? null,
        descriptionRaw: d.description,
        brand: d.brand ?? null,
        barcode: d.barcode || null,
        packageQuantity: d.packageQuantity !== undefined ? String(d.packageQuantity) : null,
        packageUnit: d.packageUnit ?? null,
        regularPriceCents: d.regularPriceCents ?? null,
        promoPriceCents: d.promoPriceCents ?? null,
        mechanism: d.mechanism,
        payQty: d.bundleQty ?? null,
        getQty: d.freeQty ?? null,
        minQty: d.bundleQty ?? d.buyQty ?? null,
        discountPct: d.discountPct ?? null,
        loyaltyRequired: d.loyaltyRequired,
        conditionsRaw: d.notes ?? null,
        validFrom: d.validFrom ?? null,
        validUntil: d.validUntil,
        source: "user",
        verification: "USER_OBSERVED",
        confidence: "HIGH", // the user saw it with their own eyes
        createdByUserId: (await getSessionContext())?.userId ?? null,
      })
      .returning()
  )[0]!;

  // Deterministic product match when a barcode or brand+description matches.
  await tryMatchPromotionProduct(inserted.id, d.barcode || null, d.brand ?? null, d.description);
  return { ok: true };
}

/**
 * Matchable product catalog (capped). Load once and pass through when
 * matching many promotions — a per-call load turned a 60-item catalogue
 * sync into 60 full product scans.
 */
export async function loadProductCandidates(): Promise<ProductCandidate[]> {
  const products = await db.select().from(product).limit(500);
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    barcode: p.barcode,
    retailerProductIds: (p.externalIds as Record<string, string> | null) ?? {},
    packageQuantity: p.packageQuantity !== null ? Number(p.packageQuantity) : null,
    packageUnit: p.packageUnit,
  }));
}

/**
 * Deterministic product matching for a promotion — shared by manual and
 * catalogue flows. Pass `candidates` (from loadProductCandidates) when
 * matching a batch; omitted, it loads the catalog itself.
 */
export async function tryMatchPromotionProduct(
  promotionId: string,
  barcode: string | null,
  brand: string | null,
  description: string,
  candidates?: ProductCandidate[],
) {
  const catalog = candidates ?? (await loadProductCandidates());
  const ref: ExternalProductRef = {
    name: description,
    brand,
    barcode,
    retailerId: null,
    retailerProductId: null,
    packageQuantity: null,
    packageUnit: null,
  };
  const resolution = resolveProduct(ref, catalog);
  if (resolution.state === "EXACT" || resolution.state === "PROBABLE") {
    await db.insert(promotionProductMatch).values({
      promotionId,
      productId: resolution.productId,
      state: resolution.state,
      matchedBy: resolution.matchedBy,
      score: String(resolution.score),
      decidedBy: "rule",
    });
  } else if (resolution.state === "AMBIGUOUS") {
    for (const pid of resolution.tiedCandidates) {
      await db
        .insert(promotionProductMatch)
        .values({ promotionId, productId: pid, state: "AMBIGUOUS", matchedBy: "none", decidedBy: "rule" })
        .onConflictDoNothing();
    }
  } else {
    await db
      .insert(promotionProductMatch)
      .values({ promotionId, productId: null, state: "UNRESOLVED", matchedBy: "none", decidedBy: "rule" });
  }
}

/** Daily sweep: expired promotions flip to EXPIRED, never deleted. */
export async function runPromotionExpiry(): Promise<{ expired: number }> {
  const run = (
    await db
      .insert(ingestionRun)
      .values({ source: "internal", kind: "promotion_expiry", status: "running" })
      .returning()
  )[0]!;
  const today = new Date().toISOString().slice(0, 10);
  const expired = await db
    .update(promotion)
    .set({ verification: "EXPIRED" })
    .where(and(lt(promotion.validUntil, today), sql`${promotion.verification} <> 'EXPIRED'`))
    .returning({ id: promotion.id });
  await db
    .update(ingestionRun)
    .set({ status: "succeeded", finishedAt: new Date(), stats: { expired: expired.length } })
    .where(eq(ingestionRun.id, run.id));
  return { expired: expired.length };
}

export type ActivePromotion = {
  promotion: typeof promotion.$inferSelect;
  retailerName: string;
  retailerSlug: string;
  storeName: string | null;
};

/**
 * Active promotions for the Offers page (valid window overlapping today).
 * Scope "enabled-stores" applies the two-tier my-stores gate — the SQL mirror
 * of matchesScope() in ./offers-scope: a store-keyed promotion needs an
 * enabled store; a national one (storeId null) needs any enabled store at its
 * retailer. Keep both shapes in sync.
 */
export async function listActivePromotions(options?: {
  userId?: string;
  scope?: OffersScope;
}): Promise<{ promotions: ActivePromotion[]; total: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const active = and(
    sql`${promotion.verification} <> 'EXPIRED'`,
    or(gte(promotion.validUntil, today), isNull(promotion.validUntil)),
  );

  let scoped: SQL | undefined;
  if (options?.scope === "enabled-stores" && options.userId) {
    const enabled = await db
      .select({ storeId: store.id, retailerId: store.retailerId })
      .from(userStorePrefs)
      .innerJoin(store, eq(userStorePrefs.storeId, store.id))
      .where(and(eq(userStorePrefs.userId, options.userId), eq(userStorePrefs.enabled, true)));
    const storeIds = [...new Set(enabled.map((row) => row.storeId))];
    const retailerIds = [...new Set(enabled.flatMap((row) => (row.retailerId ? [row.retailerId] : [])))];
    const tiers = [
      storeIds.length > 0 ? inArray(promotion.storeId, storeIds) : undefined,
      retailerIds.length > 0
        ? and(isNull(promotion.storeId), inArray(promotion.retailerId, retailerIds))
        : undefined,
    ].filter((tier): tier is SQL => tier != null);
    scoped = tiers.length > 0 ? or(...tiers) : sql`false`; // no enabled store → nothing matches
  }

  const where = scoped ? and(active, scoped) : active;

  const promotions = await db
    .select({ promotion: promotion, retailerName: retailer.name, retailerSlug: retailer.slug, storeName: store.name })
    .from(promotion)
    .innerJoin(retailer, eq(promotion.retailerId, retailer.id))
    .leftJoin(store, eq(promotion.storeId, store.id))
    .where(where)
    .orderBy(desc(promotion.createdAt))
    .limit(100);

  // Sibling count: the list is capped at 100 — let the UI say "showing 100 of N"
  // instead of truncating silently.
  const total = (await db.select({ total: sql<number>`count(*)::int` }).from(promotion).where(where))[0]!.total;

  return { promotions, total };
}
