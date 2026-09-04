/**
 * Package and purchasing-mode math: how many packs cover a need, what a
 * weight purchase costs, and what surplus is worth (residual credit).
 */
import { roundHalfUp } from "../money/money";

export type ShelfLifeClass = "storable" | "semi" | "fresh";

/** Residual-value rates per shelf-life class (product decision, Q7). */
export const RESIDUAL_RATES: Record<ShelfLifeClass, number> = {
  storable: 0.8,
  semi: 0.5,
  fresh: 0.2,
};

export type PurchasingMode = "PACKAGED" | "WEIGHT" | "UNIT";

/** Smallest pack count whose total content covers `neededBase` (g/ml/units). */
export function packsNeeded(neededBase: number, packContentBase: number): number {
  if (packContentBase <= 0) throw new Error(`pack content must be positive, got ${String(packContentBase)}`);
  if (neededBase <= 0) return 0;
  return Math.ceil(neededBase / packContentBase);
}

/** Total content obtained by buying `count` packs. */
export function contentOfPacks(count: number, packContentBase: number): number {
  return count * packContentBase;
}

/** Cost of a weight purchase: grams × cents-per-kg / 1000, rounded half up. */
export function weightCostCents(grams: number, pricePerKgCents: number): number {
  if (grams < 0 || pricePerKgCents < 0) throw new Error("negative weight purchase");
  return roundHalfUp((grams * pricePerKgCents) / 1000);
}

/**
 * Value credited back for surplus we will not consume this week.
 * credit = surplusGrams/1000 × pricePerKgCents × residualRate.
 */
export function residualCreditCents(
  surplusBase: number,
  pricePerBaseUnitCents: number, // per kg (or per l / per unit)
  shelfLife: ShelfLifeClass,
): number {
  if (surplusBase <= 0) return 0;
  return roundHalfUp((surplusBase / 1000) * pricePerBaseUnitCents * RESIDUAL_RATES[shelfLife]);
}

/** Effective cost after crediting residual surplus. Never below zero. */
export function effectiveCostCents(paidCents: number, surplusBase: number, pricePerBaseUnitCents: number, shelfLife: ShelfLifeClass): number {
  return Math.max(0, paidCents - residualCreditCents(surplusBase, pricePerBaseUnitCents, shelfLife));
}
