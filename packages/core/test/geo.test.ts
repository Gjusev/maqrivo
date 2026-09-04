import { describe, expect, it } from "vitest";
import { distanceMeters, orderStoresByProximity, snapToGrid } from "../src/geo/geo";

const COURBEVOIE = { lat: 48.8967, lng: 2.2454 };
const LA_DEFENSE = { lat: 48.8918, lng: 2.2383 };

describe("haversine distance", () => {
  it("measures Courbevoie → La Défense at roughly 800 m", () => {
    const d = distanceMeters(COURBEVOIE, LA_DEFENSE);
    expect(d).toBeGreaterThan(650);
    expect(d).toBeLessThan(950);
  });

  it("is zero for identical points and symmetric", () => {
    expect(distanceMeters(COURBEVOIE, COURBEVOIE)).toBe(0);
    expect(distanceMeters(COURBEVOIE, LA_DEFENSE)).toBe(distanceMeters(LA_DEFENSE, COURBEVOIE));
  });

  it("knows one degree of latitude is ~111 km", () => {
    const d = distanceMeters({ lat: 49, lng: 2 }, { lat: 50, lng: 2 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("grid snapping", () => {
  it("snaps to the same cell centre within one granularity", () => {
    const a = snapToGrid({ lat: 48.8967, lng: 2.2454 }, 1500);
    const b = snapToGrid({ lat: 48.8969, lng: 2.2458 }, 1500);
    expect(a).toEqual(b);
  });

  it("moves different cells to different centres", () => {
    const a = snapToGrid({ lat: 48.8967, lng: 2.2454 }, 1500);
    const c = snapToGrid({ lat: 48.9100, lng: 2.2600 }, 1500);
    expect(a).not.toEqual(c);
  });

  it("never drifts more than one granularity from the true point", () => {
    const p = { lat: 48.89671, lng: 2.24539 };
    const snapped = snapToGrid(p, 1500);
    expect(Math.abs(snapped.lat - p.lat) * 111_320).toBeLessThan(1500);
    expect(Math.abs(snapped.lng - p.lng) * 111_320).toBeLessThan(1500);
  });

  it("rejects non-positive granularity", () => {
    expect(() => snapToGrid(COURBEVOIE, 0)).toThrow();
  });
});

describe("proximity ordering", () => {
  it("orders stores as a sensible walking route from home", () => {
    const home = { lat: 48.8967, lng: 2.2454 };
    const stores = [
      { id: "far", lat: 48.9100, lng: 2.2700 },
      { id: "near", lat: 48.8970, lng: 2.2460 },
      { id: "mid", lat: 48.9000, lng: 2.2550 },
    ];
    expect(orderStoresByProximity(home, stores).map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("handles empty lists", () => {
    expect(orderStoresByProximity(COURBEVOIE, [])).toEqual([]);
  });
});
