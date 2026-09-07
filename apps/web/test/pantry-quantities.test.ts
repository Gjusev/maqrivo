import { describe, expect, it } from "vitest";
import { toBaseUnits } from "@maqrivo/core";
import { round3, slotConceptQuantities } from "../src/server/pantry/quantities";

/**
 * The pantry quantity math is load-bearing twice: the consumption sweep
 * deducts through slotConceptQuantities, and the planner nets requirements
 * through the same canonical @maqrivo/core conversion. Wrong base units
 * poison the next plan's netting, so the kg/l/unknown contract is pinned
 * here at the pantry boundary.
 */

describe("toBaseUnits (canonical conversion shared with the planner)", () => {
  it("lands kilo/litre purchases on gram/millilitre rows", () => {
    expect(toBaseUnits(1, "kg")).toBe(1000);
    expect(toBaseUnits(1.5, "l")).toBe(1500);
  });

  it("passes base units through unchanged", () => {
    expect(toBaseUnits(500, "g")).toBe(500);
    expect(toBaseUnits(250, "ml")).toBe(250);
    expect(toBaseUnits(6, "unit")).toBe(6);
    expect(toBaseUnits(1, "pack")).toBe(1);
  });

  it("rejects unknown units as null (no misread into gram space)", () => {
    expect(toBaseUnits(2, "tbsp")).toBeNull();
    expect(toBaseUnits(1, "cus")).toBeNull();
  });
});

describe("slotConceptQuantities round-trips through base units", () => {
  it("deducts a kg-scaled ingredient in grams", () => {
    const q = slotConceptQuantities([{ foodConceptId: "rice", quantity: 0.3, unit: "kg" }], 2, 4);
    expect(q.get("rice")).toBe(600); // 0.3 kg × 2 → 600 g
  });

  it("round-trips: base-unit output matches toBaseUnits on the input", () => {
    const q = slotConceptQuantities([{ foodConceptId: "oil", quantity: 0.75, unit: "l" }], 4, 4);
    expect(q.get("oil")).toBe(toBaseUnits(0.75, "l"));
  });

  it("skips unknown-unit ingredients instead of guessing a space", () => {
    const q = slotConceptQuantities(
      [
        { foodConceptId: "oil", quantity: 2, unit: "tbsp" },
        { foodConceptId: "oil", quantity: 200, unit: "ml" },
      ],
      2,
      2,
    );
    expect(q.get("oil")).toBe(200); // only the interpretable line deducts
  });
});

describe("round3 (adjustPantryQuantityAction parity)", () => {
  it("rounds to the numeric(10,3) column", () => {
    expect(round3(166.666666)).toBe(166.667);
    expect(round3(1.0005)).toBe(1.001);
  });
});
