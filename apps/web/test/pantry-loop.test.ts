import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slotConceptQuantities } from "../src/server/pantry/quantities";

/**
 * Plan 012: the pantry write-side loop. The quantity math is pure and
 * load-bearing (wrong deductions poison the next plan's netting), and the
 * purchase hook must survive refactors of plans/actions.ts.
 */

const PLANS_ACTIONS = readFileSync(new URL("../src/server/plans/actions.ts", import.meta.url), "utf8");

describe("slotConceptQuantities (per-slot pantry consumption math)", () => {
  it("scales quantities exactly with servings (×2)", () => {
    const q = slotConceptQuantities(
      [
        { foodConceptId: "rice", quantity: 200, unit: "g" },
        { foodConceptId: "milk", quantity: 0.5, unit: "l" },
      ],
      2,
      4,
    );
    expect(q.get("rice")).toBe(400);
    expect(q.get("milk")).toBe(1000); // 0.5 l × 2 → base ml
  });

  it("rounds fractional scales to 3 decimals (adjustPantryQuantityAction parity)", () => {
    const q = slotConceptQuantities([{ foodConceptId: "flour", quantity: 250, unit: "g" }], 3, 2);
    // 250 × 2/3 = 166.666… → 166.667
    expect(q.get("flour")).toBe(166.667);
  });

  it("sums repeated concepts for the same slot in base units", () => {
    const q = slotConceptQuantities(
      [
        { foodConceptId: "tomato", quantity: 0.3, unit: "kg" },
        { foodConceptId: "tomato", quantity: 150, unit: "g" },
      ],
      2,
      2,
    );
    expect(q.get("tomato")).toBe(450);
    expect(q.size).toBe(1);
  });

  it("guards zero/invalid servings (a slot with no servings cooks nothing)", () => {
    const ings = [{ foodConceptId: "rice", quantity: 100, unit: "g" }];
    expect(slotConceptQuantities(ings, 0, 1).size).toBe(0);
    expect(slotConceptQuantities(ings, 2, 0).size).toBe(0);
    expect(slotConceptQuantities(ings, Number.NaN, 1).size).toBe(0);
  });
});

describe("plan 012 wiring (source drift guards)", () => {
  it("restocks the pantry on purchased transitions", () => {
    expect(PLANS_ACTIONS).toContain("restockFromPurchase");
  });

  it("guards against double-restocking on un-purchase → re-purchase", () => {
    // The hook must only fire when the item was not already purchased.
    expect(PLANS_ACTIONS).toContain('row.item.status !== "purchased"');
  });
});
