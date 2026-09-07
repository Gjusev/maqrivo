/**
 * 'Unmatched deals' review queue: promotions whose product match came out
 * UNRESOLVED never get a deal-quality badge (no product → no price history)
 * and are invisible in optimization. This surfaces them and lets a human
 * bind the product by hand.
 */
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { product, promotion, promotionProductMatch, retailer, store } from "@maqrivo/db";

/**
 * Queue eligibility, pure so the rule is testable without a DB — the list
 * query and the resolve action both mirror it in SQL/predicate form.
 */
export function isUnmatchedEligible(
  row: { matchState: string; verification: string; validUntil: string | null },
  today: string,
): boolean {
  if (row.matchState !== "UNRESOLVED") return false;
  if (row.verification === "EXPIRED") return false;
  return row.validUntil === null || row.validUntil >= today;
}

export type UnmatchedPromotion = {
  promotionId: string;
  description: string;
  brand: string | null;
  retailerName: string;
  storeName: string | null;
  promoPriceCents: number | null;
  regularPriceCents: number | null;
  validUntil: string | null;
};

/** Unresolved, still-active promotions — soonest-expiring first, capped. */
export async function listUnmatchedPromotions(
  limit = 25,
): Promise<{ promotions: UnmatchedPromotion[]; total: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const where = and(
    eq(promotionProductMatch.state, "UNRESOLVED"),
    sql`${promotion.verification} <> 'EXPIRED'`,
    or(gte(promotion.validUntil, today), isNull(promotion.validUntil)),
  );

  const promotions = await db
    .select({
      promotionId: promotion.id,
      description: promotion.descriptionRaw,
      brand: promotion.brand,
      retailerName: retailer.name,
      storeName: store.name,
      promoPriceCents: promotion.promoPriceCents,
      regularPriceCents: promotion.regularPriceCents,
      validUntil: promotion.validUntil,
    })
    .from(promotionProductMatch)
    .innerJoin(promotion, eq(promotionProductMatch.promotionId, promotion.id))
    .innerJoin(retailer, eq(promotion.retailerId, retailer.id))
    .leftJoin(store, eq(promotion.storeId, store.id))
    .where(where)
    // Soonest expiry first — the queue is a "fix before it lapses" list.
    .orderBy(sql`${promotion.validUntil} asc nulls last`, desc(promotion.createdAt))
    .limit(limit);

  // Sibling count: the list is capped — let the UI say "(N)" for the whole queue.
  const total = (
    await db
      .select({ total: sql<number>`count(*)::int` })
      .from(promotionProductMatch)
      .innerJoin(promotion, eq(promotionProductMatch.promotionId, promotion.id))
      .where(where)
  )[0]!.total;

  return { promotions, total };
}

const resolveMatchSchema = z.object({ promotionId: z.uuid(), productId: z.uuid() });

/**
 * The ONE place a match state flips without the matcher: a human confirms the
 * product link by hand. Deliberate — a human-confirmed link is stronger
 * evidence than any fuzzy rule, so the row moves straight to EXACT with
 * decidedBy='user' instead of re-running resolution.
 */
export async function resolvePromotionMatch(
  userId: string,
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = resolveMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const { promotionId, productId } = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  const row = (
    await db
      .select({
        matchId: promotionProductMatch.id,
        matchState: promotionProductMatch.state,
        verification: promotion.verification,
        validUntil: promotion.validUntil,
      })
      .from(promotionProductMatch)
      .innerJoin(promotion, eq(promotionProductMatch.promotionId, promotion.id))
      .where(and(eq(promotionProductMatch.promotionId, promotionId), eq(promotionProductMatch.state, "UNRESOLVED")))
      .limit(1)
  )[0];
  if (!row || !isUnmatchedEligible(row, today)) return { ok: false, error: "not-unresolved" };

  // Only a global product (owner null) or one owned by this user.
  const target = (
    await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, productId), or(isNull(product.ownerUserId), eq(product.ownerUserId, userId))))
      .limit(1)
  )[0];
  if (!target) return { ok: false, error: "unknown-product" };

  await db
    .update(promotionProductMatch)
    .set({ state: "EXACT", productId, decidedBy: "user", decidedAt: new Date() })
    .where(eq(promotionProductMatch.id, row.matchId));

  revalidatePath("/offers");
  return { ok: true };
}
