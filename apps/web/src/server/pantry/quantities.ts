/**
 * Pure pantry quantity math (plan 012) — db-free by design, mirroring the
 * extraction.ts / extraction-runner.ts split: the loop's arithmetic is
 * load-bearing (wrong deductions poison the next plan's netting) and must be
 * unit-testable without a database.
 */

/** Same rounding adjustPantryQuantityAction writes (numeric(10,3) column). */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Canonical unit normalization: kg→g, l→ml, everything else identity. */
export function toBaseUnits(amount: number, unit: string): number {
  switch (unit) {
    case "kg":
      return amount * 1000;
    case "l":
      return amount * 1000;
    case "g":
    case "ml":
    case "unit":
    case "pack":
      return amount;
    default:
      return amount;
  }
}

export interface SlotIngredient {
  foodConceptId: string;
  quantity: number;
  unit: string;
}

/**
 * Per-concept quantities a slot consumes, in base units (g / ml / unit),
 * mirroring the planner's requirement netting (quantity × slotServings /
 * recipeServings, converted to base, summed per concept). Zero or invalid
 * servings yield an empty map — a slot with no servings cooks nothing.
 */
export function slotConceptQuantities(
  ingredients: SlotIngredient[],
  recipeServings: number,
  slotServings: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!Number.isFinite(recipeServings) || recipeServings <= 0) return result;
  if (!Number.isFinite(slotServings) || slotServings <= 0) return result;
  const scale = slotServings / recipeServings;
  for (const ing of ingredients) {
    const base = toBaseUnits(ing.quantity, ing.unit) * scale;
    result.set(ing.foodConceptId, round3((result.get(ing.foodConceptId) ?? 0) + base));
  }
  return result;
}
