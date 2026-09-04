/**
 * Promotion service: manual creation through the same normalized model as
 * ingested promotions, plus the daily expiry sweep.
 */
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { ingestionRun, product, promotion, promotionProductMatch, retailer, store } from "@maqrivo/db";
import { getSessionContext } from "../session";
import { resolveProduct, type ProductCandidate, type ExternalProductRef } from "@maqrivo/core";

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

async function tryMatchPromotionProduct(
  promotionId: string,
  barcode: string | null,
  brand: string | null,
  description: string,
) {
  const products = await db.select().from(product).limit(500);
  const candidates: ProductCandidate[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    barcode: p.barcode,
    retailerProductIds: p.externalIds as Record<string, string> | null ?? {},
    packageQuantity: p.packageQuantity !== null ? Number(p.packageQuantity) : null,
    packageUnit: p.packageUnit,
  }));
  const ref: ExternalProductRef = {
    name: description,
    brand,
    barcode,
    retailerId: null,
    retailerProductId: null,
    packageQuantity: null,
    packageUnit: null,
  };
  const resolution = resolveProduct(ref, candidates);
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

/** Active promotions for the Offers page (valid window overlapping today). */
export async function listActivePromotions() {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .select({ promotion: promotion, retailerName: retailer.name, retailerSlug: retailer.slug, storeName: store.name })
    .from(promotion)
    .innerJoin(retailer, eq(promotion.retailerId, retailer.id))
    .leftJoin(store, eq(promotion.storeId, store.id))
    .where(
      and(
        sql`${promotion.verification} <> 'EXPIRED'`,
        or(gte(promotion.validUntil, today), isNull(promotion.validUntil)),
      ),
    )
    .orderBy(desc(promotion.createdAt))
    .limit(100);
}
