import { describe, expect, it } from "vitest";
import { matchStoreLocation } from "../src/geo/geo";

const LA_DEFENSE_MONOPRIX_NODE = { name: "Monoprix", lat: 48.8918, lng: 2.2378 };

describe("matchStoreLocation", () => {
  it("matches the same shop mapped as a different OSM element nearby", () => {
    const candidates = [
      { key: "WAY:712015104", name: "Monoprix", lat: 48.8914, lon: 2.2382 }, // ~50 m away
      { key: "WAY:628777992", name: "Carrefour City", lat: 48.8914, lon: 2.2382 },
    ];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)?.key).toBe("WAY:712015104");
  });

  it("ignores different shop names at the same spot", () => {
    const candidates = [{ key: "WAY:1", name: "Franprix", lat: 48.8918, lon: 2.2378 }];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)).toBeNull();
  });

  it("requires normalized-name equality, not fuzzy similarity", () => {
    const candidates = [{ key: "WAY:2", name: "Monoprix BEZONS", lat: 48.8918, lon: 2.2378 }];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)).toBeNull();
  });

  it("normalizes accents and case", () => {
    const candidates = [{ key: "NODE:9", name: "  CARREFOUR Market ", lat: 48.8918, lon: 2.2378 }];
    expect(matchStoreLocation({ name: "Carrefour Market", lat: 48.8918, lng: 2.2378 }, candidates)?.key).toBe("NODE:9");
  });

  it("rejects matches beyond the radius", () => {
    // ~310 m south — outside the 150 m default
    const candidates = [{ key: "WAY:3", name: "Monoprix", lat: 48.889, lon: 2.2378 }];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)).toBeNull();
  });

  it("prefers the nearest of several same-name candidates", () => {
    const candidates = [
      { key: "WAY:far", name: "Monoprix", lat: 48.8926, lon: 2.2378 }, // ~90 m
      { key: "WAY:near", name: "Monoprix", lat: 48.892, lon: 2.2378 }, // ~25 m
    ];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)?.key).toBe("WAY:near");
  });

  it("skips candidates without coordinates or name", () => {
    const candidates = [
      { key: "WAY:x", name: "Monoprix", lat: null, lon: 2.2382 },
      { key: "WAY:y", name: null, lat: 48.8914, lon: 2.2382 },
    ];
    expect(matchStoreLocation(LA_DEFENSE_MONOPRIX_NODE, candidates)).toBeNull();
  });
});
