/**
 * Two-tier "my stores" scope for offers — the same gate catalogue-sync applies
 * when deciding which flipbooks to fetch: a store-keyed offer belongs to the
 * user when its store is enabled; a national offer (no store) belongs when the
 * retailer has ANY enabled store. Pure so the rule is testable without a DB;
 * listActivePromotions mirrors it in SQL — keep the shapes in sync.
 */
export type OffersScope = "enabled-stores" | "all";

export function matchesScope(
  offer: { storeId: string | null; retailerId: string },
  enabledStoreIds: ReadonlySet<string>,
  enabledRetailerIds: ReadonlySet<string>,
): boolean {
  if (offer.storeId != null) return enabledStoreIds.has(offer.storeId);
  return enabledRetailerIds.has(offer.retailerId);
}
