/**
 * Deterministic nutrition computation. No AI, no guessing.
 */
import type { Quantity } from "../units/types";
import { dimensionOf, convert } from "../units/types";
import {
  EMPTY_NUTRITION,
  NUTRIENT_KEYS,
  type NutrientKey,
  type NutritionBasis,
  type NutritionPer100,
  type NutritionValues,
} from "./types";

/** Round computed nutrient values to honest precision. */
export function roundNutrient(key: string, value: number): number {
  if (key === "energyKcal") return Math.round(value);
  return Math.round(value * 10) / 10;
}

/**
 * Nutrition delivered by a quantity of a food whose composition is given
 * per 100 g/ml. Quantity dimension must match the basis dimension.
 */
export function nutritionFor(per100: NutritionPer100, q: Quantity): NutritionValues {
  const basisUnit: Record<NutritionBasis, "g" | "ml"> = { "100g": "g", "100ml": "ml" };
  const basis = basisUnit[per100.basis];
  if (dimensionOf(q.unit) !== dimensionOf(basis)) {
    throw new Error(
      `Quantity dimension mismatch: nutrition basis is per ${basis} but quantity is in ${q.unit}`,
    );
  }
  const grams = convert(q.amount, q.unit, basis);
  const factor = grams / 100;
  const result: Record<string, number | null> = {};
  for (const key of NUTRIENT_KEYS) {
    const v = per100[key];
    result[key] = v === null ? null : roundNutrient(key, v * factor);
  }
  return result as unknown as NutritionValues;
}

export interface IngredientNutrition {
  readonly quantity: Quantity;
  readonly nutrition: NutritionPer100 | null; // null = unknown food composition
}

export interface NutritionTotal extends NutritionValues {
  /** How many ingredients had no composition data at all. */
  readonly unknownIngredients: number;
  /** Nutrient fields left null because at least one known ingredient lacks them. */
  readonly incompleteFields: readonly NutrientKey[];
}

/**
 * Total nutrition of a list of ingredients. A nutrient field is null
 * (unknown) when any ingredient with known composition lacks it; ingredients
 * with entirely unknown composition are counted and force every field unknown
 * only if the caller treats them as opaque — here they null out the totals,
 * because a total that silently ignores an ingredient would be a lie.
 */
export function totalNutrition(ingredients: readonly IngredientNutrition[]): NutritionTotal {
  let unknownIngredients = 0;
  const sums = new Map<NutrientKey, number>();
  const incomplete: Set<NutrientKey> = new Set();
  let anyKnown = false;

  for (const ing of ingredients) {
    if (ing.nutrition === null) {
      unknownIngredients += 1;
      continue;
    }
    anyKnown = true;
    for (const key of NUTRIENT_KEYS) {
      const v = ing.nutrition[key];
      if (v === null) {
        incomplete.add(key);
        continue;
      }
      const perIng = nutritionFor(ing.nutrition, ing.quantity)[key];
      if (perIng !== null) {
        sums.set(key, (sums.get(key) ?? 0) + perIng);
      }
    }
  }

  const values: Record<string, number | null> = {};
  for (const key of NUTRIENT_KEYS) {
    const known = sums.get(key);
    values[key] = unknownIngredients > 0 || incomplete.has(key) || known === undefined ? null : roundNutrient(key, known);
  }
  if (!anyKnown && unknownIngredients === 0) {
    return { ...EMPTY_NUTRITION, unknownIngredients: 0, incompleteFields: [] };
  }
  return {
    ...(values as unknown as NutritionValues),
    unknownIngredients,
    incompleteFields: [...incomplete],
  };
}

/** Scale a quantity by a servings factor (e.g. cook for 4 instead of 2). */
export function scaleQuantity(q: Quantity, fromServings: number, toServings: number): Quantity {
  if (fromServings <= 0) throw new Error(`fromServings must be positive, got ${String(fromServings)}`);
  return { amount: Math.round(q.amount * (toServings / fromServings) * 1000) / 1000, unit: q.unit };
}
