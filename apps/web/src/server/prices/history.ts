/**
 * Price history queries: per store×basis statistics for a product, and
 * deal assessments comparing promotion prices against observed history.
 * Pure reads — the analytics themselves live in @maqrivo/core.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { priceObservation, product, promotionProductMatch, store } from "@maqrivo/db";
import {
  assessDeal,
  assessLatestPrice,
  freshnessOf,
  summarizePriceHistory,
  type DealAssessment,
  type PriceHistorySummary,
  type PricePoint,
} from "@maqrivo/core";

export interface StorePriceHistory {
  storeId: string;
  storeName: string;
  /** Observations on one basis only — unit and per-kg never mix. */
  basis: string;
  summary: PriceHistorySummary;
  /** Chronological points feeding the sparkline. */
  points: PricePoint[];
  /** Latest price vs everything seen before it. */
  latestAssessment: DealAssessment;
  latestSource: string;
  latestFresh: boolean;
  /** Age in whole days of the latest observation. */
  latestAgeDays: number;
}

export interface ProductPriceHistory {
  groups: StorePriceHistory[];
  /** Freshest observation overall (any store) — the metrics anchor. */
  freshest: { obs: typeof priceObservation.$inferSelect; storeName: string } | null;
}

export async function priceHistoryForProduct(productId: string): Promise<ProductPriceHistory> {
  const rows = await db
    .select({ obs: priceObservation, storeName: store.name })
    .from(priceObservation)
    .innerJoin(store, eq(priceObservation.storeId, store.id))
    .where(eq(priceObservation.productId, productId))
    .orderBy(desc(priceObservation.observedAt));

  // rows arrive newest-first: the first point pushed per group is the latest.
  const grouped = new Map<
    string,
    { storeId: string; storeName: string; basis: string; points: PricePoint[]; latestObs: typeof priceObservation.$inferSelect }
  >();
  for (const { obs, storeName } of rows) {
    const key = `${obs.storeId}:${obs.priceBasis}`;
    let group = grouped.get(key);
    if (!group) {
      group = { storeId: obs.storeId, storeName, basis: obs.priceBasis, points: [], latestObs: obs };
      grouped.set(key, group);
    }
    group.points.push({
      observedAt: obs.observedAt.getTime(),
      amountCents: obs.amountCents,
      discounted: obs.discounted,
    });
  }

  const now = new Date();
  const groups: StorePriceHistory[] = [...grouped.values()].map((group) => {
    const points = [...group.points].sort(
      (a, b) => a.observedAt - b.observedAt || a.amountCents - b.amountCents,
    );
    const summary = summarizePriceHistory(points)!;
    const freshness = freshnessOf(group.latestObs.observedAt, group.latestObs.source, now);
    return {
      storeId: group.storeId,
      storeName: group.storeName,
      basis: group.basis,
      points,
      summary,
      latestAssessment: assessLatestPrice(points),
      latestSource: group.latestObs.source,
      latestFresh: freshness.state === "fresh",
      latestAgeDays: freshness.ageDays,
    };
  });
  groups.sort((a, b) => a.storeName.localeCompare(b.storeName) || a.basis.localeCompare(b.basis));

  return { groups, freshest: rows[0] ? { obs: rows[0].obs, storeName: rows[0].storeName } : null };
}

export interface PromotionDeal {
  assessment: DealAssessment;
  productId: string;
  productName: string;
}

export interface AssessablePromotion {
  id: string;
  storeId: string | null;
  promoPriceCents: number | null;
  pricePerKgCents: number | null;
}

/**
 * Compare each promotion's directly comparable price (pack price vs unit
 * observations, per-kg price vs per-kg observations) against the matched
 * product's observed history — per store when the promotion is store-scoped,
 * across stores otherwise. Mechanisms without a directly comparable price
 * (multibuy, percentages…) get no badge: no fabrication.
 */
export async function promotionDealAssessments(
  promotions: readonly AssessablePromotion[],
): Promise<Map<string, PromotionDeal>> {
  const result = new Map<string, PromotionDeal>();
  if (promotions.length === 0) return result;
  const ids = promotions.map((p) => p.id);

  const matchRows = await db
    .select({
      promotionId: promotionProductMatch.promotionId,
      productId: promotionProductMatch.productId,
      productName: product.name,
    })
    .from(promotionProductMatch)
    .innerJoin(product, eq(promotionProductMatch.productId, product.id))
    .where(
      and(
        inArray(promotionProductMatch.promotionId, ids),
        inArray(promotionProductMatch.state, ["EXACT", "PROBABLE"]),
      ),
    )
    .orderBy(promotionProductMatch.productId);
  const matches = matchRows.filter((m): m is typeof m & { productId: string } => m.productId !== null);
  if (matches.length === 0) return result;

  const observations = await db
    .select()
    .from(priceObservation)
    .where(
      inArray(
        priceObservation.productId,
        matches.map((m) => m.productId),
      ),
    );

  // Pools keyed for both scopes: per (product, store, basis) and per (product, basis).
  const poolByStore = new Map<string, PricePoint[]>();
  const poolAcrossStores = new Map<string, PricePoint[]>();
  for (const obs of observations) {
    const point: PricePoint = {
      observedAt: obs.observedAt.getTime(),
      amountCents: obs.amountCents,
      discounted: obs.discounted,
    };
    const storeKey = `${obs.productId}:${obs.storeId}:${obs.priceBasis}`;
    const allKey = `${obs.productId}:${obs.priceBasis}`;
    (poolByStore.get(storeKey) ?? poolByStore.set(storeKey, []).get(storeKey)!).push(point);
    (poolAcrossStores.get(allKey) ?? poolAcrossStores.set(allKey, []).get(allKey)!).push(point);
  }

  const matchByPromotion = new Map<string, (typeof matches)[number]>();
  for (const match of matches) {
    if (!matchByPromotion.has(match.promotionId)) matchByPromotion.set(match.promotionId, match);
  }

  for (const promo of promotions) {
    const match = matchByPromotion.get(promo.id);
    if (!match) continue;
    // A directly comparable price on a matching basis, or nothing.
    const comparable =
      promo.promoPriceCents != null
        ? { cents: promo.promoPriceCents, basis: "unit" }
        : promo.pricePerKgCents != null
          ? { cents: promo.pricePerKgCents, basis: "per_kg" }
          : null;
    if (!comparable) continue;
    const pool = promo.storeId
      ? poolByStore.get(`${match.productId}:${promo.storeId}:${comparable.basis}`)
      : poolAcrossStores.get(`${match.productId}:${comparable.basis}`);
    if (!pool || pool.length === 0) continue;
    result.set(promo.id, {
      assessment: assessDeal(comparable.cents, pool),
      productId: match.productId,
      productName: match.productName,
    });
  }
  return result;
}
