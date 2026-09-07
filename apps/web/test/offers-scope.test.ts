import { describe, expect, it } from "vitest";
import { matchesScope } from "../src/server/ingestion/offers-scope";

/**
 * The two-tier "my stores" gate for offers, mirroring catalogue-sync's
 * flipbook fetch decision: store-keyed offers follow the store's enabled
 * flag; national offers (no store) follow "any store of that retailer
 * enabled".
 */
describe("offers my-stores scope (two-tier predicate)", () => {
  const enabledStoreIds = new Set(["store-enabled"]);
  const enabledRetailerIds = new Set(["retailer-enabled"]);

  it("keeps an offer pinned to an enabled store", () => {
    expect(
      matchesScope({ storeId: "store-enabled", retailerId: "retailer-other" }, enabledStoreIds, enabledRetailerIds),
    ).toBe(true);
  });

  it("drops an offer pinned to a foreign store, even at an enabled retailer", () => {
    expect(
      matchesScope({ storeId: "store-foreign", retailerId: "retailer-enabled" }, enabledStoreIds, enabledRetailerIds),
    ).toBe(false);
  });

  it("keeps a national offer of a retailer with any enabled store", () => {
    expect(
      matchesScope({ storeId: null, retailerId: "retailer-enabled" }, enabledStoreIds, enabledRetailerIds),
    ).toBe(true);
  });

  it("drops a national offer of a retailer with no enabled store", () => {
    expect(
      matchesScope({ storeId: null, retailerId: "retailer-other" }, enabledStoreIds, enabledRetailerIds),
    ).toBe(false);
  });

  it("matches nothing when the user has no enabled stores", () => {
    const emptyStores = new Set<string>();
    const emptyRetailers = new Set<string>();
    expect(matchesScope({ storeId: "store-enabled", retailerId: "retailer-enabled" }, emptyStores, emptyRetailers)).toBe(
      false,
    );
    expect(matchesScope({ storeId: null, retailerId: "retailer-enabled" }, emptyStores, emptyRetailers)).toBe(false);
  });
});
