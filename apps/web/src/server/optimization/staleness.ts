/**
 * Plan staleness (plan 013): how many pricing facts changed under a plan's
 * feet since it was generated. Prices land nightly (openprices 05:43) and
 * promotions extract each morning (catalogue-sync 06:09, page-extraction
 * 06:41), so a Monday plan quietly optimizes against dead data by
 * mid-week. The badge surfaces the drift; the opt-in weekly job acts on it.
 */
import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  mealPlan,
  priceObservation,
  promotion,
  promotionProductMatch,
  shoppingItem,
  shoppingPlan,
} from "@maqrivo/db";

export interface PlanStaleness {
  stale: boolean;
  newPriceObservations: number;
  newPromotions: number;
  newestDataAt: Date | null;
}

/**
 * Starting heuristic: five changed facts (new price observations + new
 * non-expired promotions touching the plan's products) mark a plan stale.
 * Tune from the owner's lived experience, not theory.
 */
export const STALENESS_THRESHOLD = 5;

/** Pure threshold check — one definition shared by the query, badge and job. */
export function isStale(newPriceObservations: number, newPromotions: number): boolean {
  return newPriceObservations + newPromotions >= STALENESS_THRESHOLD;
}

const FRESH: PlanStaleness = { stale: false, newPriceObservations: 0, newPromotions: 0, newestDataAt: null };

/**
 * Count facts newer than the plan: price observations observed after it was
 * created, and promotions created after it that are bound (EXACT/PROBABLE)
 * to one of the plan's products and not expired. Runs per dashboard render,
 * so every query below is a small indexed count.
 */
export async function computePlanStaleness(planId: string): Promise<PlanStaleness> {
  const plan = (
    await db.select({ createdAt: mealPlan.createdAt }).from(mealPlan).where(eq(mealPlan.id, planId)).limit(1)
  )[0];
  if (!plan) return FRESH;

  // Products the plan's shopping items point at — the things whose prices matter.
  const productRows = await db
    .selectDistinct({ productId: shoppingItem.productId })
    .from(shoppingItem)
    .innerJoin(shoppingPlan, eq(shoppingItem.shoppingPlanId, shoppingPlan.id))
    .where(and(eq(shoppingPlan.mealPlanId, planId), isNotNull(shoppingItem.productId)));
  const productIds = productRows.flatMap((r) => (r.productId ? [r.productId] : []));
  if (productIds.length === 0) return FRESH;

  const prices = (
    await db
      .select({ n: sql<number>`count(*)::int`, newest: sql<Date | null>`max(${priceObservation.observedAt})` })
      .from(priceObservation)
      .where(and(inArray(priceObservation.productId, productIds), gt(priceObservation.observedAt, plan.createdAt)))
  )[0]!;

  // A promotion matched to two plan products is still one changed fact.
  const promos = (
    await db
      .select({
        n: sql<number>`count(distinct ${promotion.id})::int`,
        newest: sql<Date | null>`max(${promotion.createdAt})`,
      })
      .from(promotion)
      .innerJoin(promotionProductMatch, eq(promotionProductMatch.promotionId, promotion.id))
      .where(
        and(
          inArray(promotionProductMatch.productId, productIds),
          inArray(promotionProductMatch.state, ["EXACT", "PROBABLE"]),
          ne(promotion.verification, "EXPIRED"),
          gt(promotion.createdAt, plan.createdAt),
        ),
      )
  )[0]!;

  const newPriceObservations = prices?.n ?? 0;
  const newPromotions = promos?.n ?? 0;
  const newestDataAt = [prices?.newest ?? null, promos?.newest ?? null].reduce<Date | null>((acc, d) => {
    if (d == null) return acc;
    return acc == null || d > acc ? d : acc;
  }, null);

  return { stale: isStale(newPriceObservations, newPromotions), newPriceObservations, newPromotions, newestDataAt };
}
