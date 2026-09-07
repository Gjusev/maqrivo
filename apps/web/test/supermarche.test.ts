import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverStoresSupermarche } from "../src/server/integrations/supermarche";
import { reverseGeocode } from "../src/server/integrations/osm/photon";

const lookupMock = vi.hoisted(() =>
  vi.fn<(hostname: string) => Promise<Array<{ address: string; family: number }>>>(),
);
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

beforeEach(() => {
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supermarche.com directory client", () => {
  it("reads the current /supermarkets/nearby shape with OSM identity", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        center: { lat: 48.89, lon: 2.23 },
        radius_km: 2,
        count: 1,
        results: [
          {
            id: "way/628777992",
            osm: { type: "way", id: 628777992 },
            name: "Carrefour City",
            brand: "Carrefour City",
            shop_type: "convenience",
            location: { lat: 48.8914, lon: 2.2382 },
            address: { street: "Le Parvis", postcode: "92800", city: "Puteaux" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const [candidate] = await discoverStoresSupermarche({ lat: 48.89, lng: 2.23 }, 2);
    expect(candidate).toBeDefined();
    expect(candidate!.name).toBe("Carrefour City");
    expect(candidate!.retailerSlug).toBe("carrefour"); // banner word, not exact key
    expect(candidate!.lat).toBe(48.8914);
    expect(candidate!.address).toBe("Le Parvis 92800 Puteaux");
    expect(candidate!.externalIds).toEqual({ supermarche: "way/628777992", osm_way: "628777992" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.supermarche.com/supermarkets/nearby?lat=48.89&lon=2.23&radius_km=2&limit=100",
      expect.anything(),
    );
  });

  it("keeps a supermarche-only identity when OSM data is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({
        results: [
          { id: "x1", osm: null, name: "Épicerie du coin", brand: null, location: { lat: 1, lon: 2 } },
        ],
      }),
    ));
    const [candidate] = await discoverStoresSupermarche({ lat: 1, lng: 2 }, 2);
    expect(candidate!.externalIds).toEqual({ supermarche: "x1" });
    expect(candidate!.retailerSlug).toBeNull();
  });
});

describe("photon reverse path", () => {
  it("calls /reverse at the host root even when the endpoint points at /api", async () => {
    const fetchMock = vi.fn(async (_input?: unknown) =>
      Response.json({
        features: [
          {
            geometry: { coordinates: [2.2369, 48.8922] },
            properties: { name: "X", city: "Puteaux", postcode: "92800", country: "France" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const label = await reverseGeocode(48.8922, 2.2369, "https://photon.komoot.io/api");
    expect(label).toBeTruthy();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toBe("https://photon.komoot.io/reverse?lat=48.8922&lon=2.2369&lang=fr&limit=1");
  });
});
