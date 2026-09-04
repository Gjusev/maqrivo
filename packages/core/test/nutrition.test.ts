import { describe, expect, it } from "vitest";
import { nutritionFor, scaleQuantity, totalNutrition } from "../src/nutrition/compute";
import type { NutritionPer100 } from "../src/nutrition/types";
import { quantity } from "../src/units/types";

// Reference food: dry chicken breast ~ per 100 g
const chicken: NutritionPer100 = {
  basis: "100g",
  energyKcal: 165,
  proteinG: 31,
  carbohydrateG: 0,
  fatG: 3.6,
  saturatedFatG: 1,
  fiberG: 0,
  sugarsG: 0,
  saltG: 0.07,
};

describe("nutritionFor (per-100 scaling)", () => {
  it("scales linearly to a mass quantity", () => {
    const n = nutritionFor(chicken, quantity(200, "g"));
    expect(n.energyKcal).toBe(330);
    expect(n.proteinG).toBe(62);
    expect(n.fatG).toBe(7.2);
  });

  it("converts kg quantities before scaling", () => {
    const n = nutritionFor(chicken, quantity(0.15, "kg"));
    expect(n.energyKcal).toBe(248); // 165 * 1.5 = 247.5 → 248
    expect(n.proteinG).toBe(46.5);
  });

  it("handles volume-based products", () => {
    const milk: NutritionPer100 = {
      basis: "100ml",
      energyKcal: 64,
      proteinG: 3.3,
      carbohydrateG: 4.8,
      fatG: 3.6,
      saturatedFatG: 2.3,
      fiberG: null,
      sugarsG: 4.8,
      saltG: 0.1,
    };
    const n = nutritionFor(milk, quantity(250, "ml"));
    expect(n.energyKcal).toBe(160);
    expect(n.proteinG).toBe(8.3); // 8.25 → 8.3 (1 decimal, no false precision beyond that)
  });

  it("preserves null as unknown, never zero", () => {
    const partial: NutritionPer100 = {
      basis: "100g",
      energyKcal: 100,
      proteinG: null,
      carbohydrateG: null,
      fatG: null,
      saturatedFatG: null,
      fiberG: null,
      sugarsG: null,
      saltG: null,
    };
    const n = nutritionFor(partial, quantity(100, "g"));
    expect(n.energyKcal).toBe(100);
    expect(n.proteinG).toBeNull();
  });

  it("rejects dimension mismatch", () => {
    expect(() => nutritionFor(chicken, quantity(200, "ml"))).toThrow(/dimension/);
  });

  it("rounds grams to one decimal — no 37.2841 g theatre", () => {
    const odd: NutritionPer100 = {
      basis: "100g",
      energyKcal: 113,
      proteinG: 7.33,
      carbohydrateG: null,
      fatG: null,
      saturatedFatG: null,
      fiberG: null,
      sugarsG: null,
      saltG: null,
    };
    const n = nutritionFor(odd, quantity(137, "g"));
    expect(n.proteinG).toBe(10); // 7.33 × 1.37 = 10.0421 → 10.0421 → 10.0
  });
});

describe("totalNutrition (recipe totals)", () => {
  it("sums multiple ingredients honestly", () => {
    const rice: NutritionPer100 = {
      basis: "100g",
      energyKcal: 349,
      proteinG: 7.1,
      carbohydrateG: 77,
      fatG: 0.9,
      saturatedFatG: 0.3,
      fiberG: 1.3,
      sugarsG: 0.1,
      saltG: 0.01,
    };
    const total = totalNutrition([
      { quantity: quantity(150, "g"), nutrition: chicken },
      { quantity: quantity(80, "g"), nutrition: rice },
    ]);
    // chicken 150 g: 247.5 kcal, 46.5 p; rice 80 g: 279.2 kcal, 5.68 p
    expect(total.energyKcal).toBe(527); // 247.5→248, 279.2→279, sum 527 after per-item rounding
    expect(total.proteinG).toBe(52.2);
    expect(total.unknownIngredients).toBe(0);
    expect(total.incompleteFields).toEqual([]);
  });

  it("nulls out totals when an ingredient has unknown composition", () => {
    const total = totalNutrition([
      { quantity: quantity(150, "g"), nutrition: chicken },
      { quantity: quantity(50, "g"), nutrition: null },
    ]);
    expect(total.unknownIngredients).toBe(1);
    expect(total.energyKcal).toBeNull(); // a total ignoring an ingredient would be a lie
  });

  it("marks fields incomplete when a known ingredient lacks them", () => {
    const noFiber: NutritionPer100 = {
      basis: "100g",
      energyKcal: 50,
      proteinG: 4,
      carbohydrateG: 1,
      fatG: 2,
      saturatedFatG: 1,
      fiberG: null,
      sugarsG: 0.5,
      saltG: 0.05,
    };
    const total = totalNutrition([{ quantity: quantity(100, "g"), nutrition: noFiber }]);
    expect(total.fiberG).toBeNull();
    expect(total.incompleteFields).toContain("fiberG");
  });

  it("returns all-null for an empty recipe without lying about it", () => {
    const total = totalNutrition([]);
    expect(total.energyKcal).toBeNull();
    expect(total.unknownIngredients).toBe(0);
  });
});

describe("recipe scaling", () => {
  it("scales ingredient quantities by servings ratio", () => {
    expect(scaleQuantity(quantity(200, "g"), 2, 4)).toEqual({ amount: 400, unit: "g" });
    expect(scaleQuantity(quantity(1, "unit"), 4, 2)).toEqual({ amount: 0.5, unit: "unit" });
    expect(scaleQuantity(quantity(333, "g"), 3, 4)).toEqual({ amount: 444, unit: "g" });
  });

  it("rejects zero source servings", () => {
    expect(() => scaleQuantity(quantity(100, "g"), 0, 2)).toThrow();
  });
});
