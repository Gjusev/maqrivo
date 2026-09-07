/**
 * Dashboard digest: promotions that arrived in the last 7 days within the
 * user's two-tier store scope. Kept in a server module (not the page) so a
 * future notifier job can reuse the same payload (plan 006).
 */
import { and, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { promotion, retailer, store, userStorePrefs } from "@maqrivo/db";

export interface NewOffersDigestItem {
  id: string;
  descriptionRaw: string;
  retailerName: string;
  promoPriceCents: number | null;
  regularPriceCents: number | null;
  pricePerKgCents: number | null;
}

const DIGEST_WINDOW_DAYS = 7;

/**
 * Newest promotions for the "New at your stores" card. The scope filter is
 * the SQL mirror of matchesScope() (offers-scope.ts) — same shape as
 * listActivePromotions: a store-keyed promotion needs an enabled store, a
 * national one (storeId null) any enabled store of its retailer.
 */
export async function getNewOffersDigest(
  userId: string,
  limit = 5,
): Promise<{ items: NewOffersDigestItem[]; total: number }> {
  const enabled = await db
    .select({ storeId: store.id, retailerId: store.retailerId })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .where(and(eq(userStorePrefs.userId, userId), eq(userStorePrefs.enabled, true)));
  const storeIds = [...new Set(enabled.map((row) => row.storeId))];
  const retailerIds = [...new Set(enabled.flatMap((row) => (row.retailerId ? [row.retailerId] : [])))];
  const tiers = [
    storeIds.length > 0 ? inArray(promotion.storeId, storeIds) : undefined,
    retailerIds.length > 0 ? and(isNull(promotion.storeId), inArray(promotion.retailerId, retailerIds)) : undefined,
  ].filter((tier): tier is SQL => tier != null);
  const scoped = tiers.length > 0 ? or(...tiers) : sql`false`; // no enabled store → nothing matches

  const since = new Date();
  since.setDate(since.getDate() - DIGEST_WINDOW_DAYS);
  const where = and(gte(promotion.createdAt, since), scoped);

  const items = await db
    .select({
      id: promotion.id,
      descriptionRaw: promotion.descriptionRaw,
      retailerName: retailer.name,
      promoPriceCents: promotion.promoPriceCents,
      regularPriceCents: promotion.regularPriceCents,
      pricePerKgCents: promotion.pricePerKgCents,
    })
    .from(promotion)
    .innerJoin(retailer, eq(promotion.retailerId, retailer.id))
    .where(where)
    .orderBy(desc(promotion.createdAt))
    .limit(limit);

  const total = (await db.select({ total: sql<number>`count(*)::int` }).from(promotion).where(where))[0]!.total;
  return { items, total };
}
