import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOpenPricesAtLocation,
  findOpenPricesLocations,
} from "../src/server/integrations/openprices";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Open Prices current and legacy response compatibility", () => {
  it("reads current nearby location fields with the OSM element type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{ id: 7, osm_id: 1234, osm_type: "WAY", osm_name: "Market" }],
      page: 1,
      pages: 1,
      size: 100,
      total: 1,
    })));
    await expect(findOpenPricesLocations({ lat: 48.9, lng: 2.2 }, 2)).resolves.toEqual([
      { locationId: 7, osmId: 1234, osmType: "WAY", name: "Market" },
    ]);
  });

  it("reads current price ids and product_code instead of numeric product ids", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{
        id: 9,
        product_id: 812,
        product_code: "8001505005707",
        price: 2.49,
        currency: "EUR",
        date: "2026-09-05",
        price_is_discounted: true,
        price_without_discount: 3.19,
        location_id: 7,
      }],
    })));
    await expect(fetchOpenPricesAtLocation(7)).resolves.toEqual([
      {
        priceId: 9,
        productId: "8001505005707",
        amountCents: 249,
        currency: "EUR",
        date: "2026-09-05",
        discounted: true,
        regularAmountCents: 319,
      },
    ]);
  });

  it("keeps accepting the legacy field names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{ location_id: 3, osm_node_id: 99, name: "Legacy" }],
    })));
    await expect(findOpenPricesLocations({ lat: 48.9, lng: 2.2 }, 2)).resolves.toEqual([
      { locationId: 3, osmId: 99, osmType: "NODE", name: "Legacy" },
    ]);
  });
});
