import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAllOpenPricesAtLocation,
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
      { locationId: 7, osmId: 1234, osmType: "WAY", name: "Market", lat: null, lon: null, priceCount: null },
    ]);
  });

  it("reads location coordinates and price volume for the proximity fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{
        id: 6137,
        osm_id: 712015104,
        osm_type: "WAY",
        osm_name: "Monoprix",
        osm_lat: 48.8914,
        osm_lon: 2.2382,
        price_count: 100,
      }],
    })));
    await expect(findOpenPricesLocations({ lat: 48.9, lng: 2.2 }, 2)).resolves.toEqual([
      { locationId: 6137, osmId: 712015104, osmType: "WAY", name: "Monoprix", lat: 48.8914, lon: 2.2382, priceCount: 100 },
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
      { locationId: 3, osmId: 99, osmType: "NODE", name: "Legacy", lat: null, lon: null, priceCount: null },
    ]);
  });

  it("reads every price page for busy locations", async () => {
    const pageItem = (id: number) => ({
      id,
      product_code: `400${String(id).padStart(9, "0")}`,
      price: 1.5,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      // Page 1 full (100) → page 2 partial (2) → stop.
      const items = page === 1 ? Array.from({ length: 100 }, (_, i) => pageItem(i + 1)) : [pageItem(101), pageItem(102)];
      return Response.json({ items });
    }));
    const all = await fetchAllOpenPricesAtLocation(5177, 5);
    expect(all).toHaveLength(102);
  });

  it("stops paginating when a page comes back short", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{ id: 1, product_code: "3017620422003", price: 3.5 }],
    })));
    const all = await fetchAllOpenPricesAtLocation(6026, 5);
    expect(all).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
 });
