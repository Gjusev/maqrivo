/**
 * Nutrition model.
 *
 * Rules:
 * - Values are per 100 g or per 100 ml (normalized upstream at import).
 * - `null` means UNKNOWN. Unknown is never zero and never invented.
 * - Scaling preserves source precision: computed totals round to
 *   1 decimal for grams, integers for kcal — no false precision.
 */

export interface NutritionValues {
  readonly energyKcal: number | null;
  readonly proteinG: number | null;
  readonly carbohydrateG: number | null;
  readonly fatG: number | null;
  readonly saturatedFatG: number | null;
  readonly fiberG: number | null;
  readonly sugarsG: number | null;
  readonly saltG: number | null;
}

export type NutritionBasis = "100g" | "100ml";

export interface NutritionPer100 extends NutritionValues {
  readonly basis: NutritionBasis;
}

export const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "saturatedFatG",
  "fiberG",
  "sugarsG",
  "saltG",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const EMPTY_NUTRITION: NutritionValues = {
  energyKcal: null,
  proteinG: null,
  carbohydrateG: null,
  fatG: null,
  saturatedFatG: null,
  fiberG: null,
  sugarsG: null,
  saltG: null,
};
