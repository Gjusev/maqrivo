/**
 * Deterministic value metrics — protein per euro, cost per 10 g protein,
 * calories per euro. Computed, never AI-generated; gated on price freshness
 * and nutrition completeness (no evidence, no metric).
 */
import type { Freshness } from "../freshness/policies";
import { roundHalfUp } from "../money/money";

export interface MetricInputs {
  /** Protein per 100 g/ml of the food. Null = unknown → no metric. */
  readonly proteinPer100: number | null;
  /** Price in cents for the reference quantity. */
  readonly priceCents: number;
  /** Quantity of food the price buys, in grams or ml. */
  readonly quantityBase: number; // g or ml
  readonly freshness: Freshness | null; // null = no observation at all
}

export interface ValueMetrics {
  /** Grams of protein per euro (1 decimal). Null when data is insufficient or stale. */
  readonly proteinPerEuro: number | null;
  /** Cost in cents for 10 g of protein (integer). */
  readonly costPer10gProteinCents: number | null;
  /** kcal per euro (integer). */
  readonly caloriesPerEuro: number | null;
}

export function computeValueMetrics(input: MetricInputs & { energyKcalPer100: number | null }): ValueMetrics {
  const hasFreshPrice = input.freshness !== null && input.freshness.state === "fresh";
  if (!hasFreshPrice || input.proteinPer100 === null || input.priceCents <= 0 || input.quantityBase <= 0) {
    return { proteinPerEuro: null, costPer10gProteinCents: null, caloriesPerEuro: null };
  }
  const proteinGramsTotal = (input.proteinPer100 * input.quantityBase) / 100;
  const euros = input.priceCents / 100;
  const proteinPerEuro = Math.round((proteinGramsTotal / euros) * 10) / 10;
  const costPer10gProteinCents = proteinGramsTotal > 0 ? roundHalfUp((input.priceCents * 10) / proteinGramsTotal) : null;
  const caloriesPerEuro =
    input.energyKcalPer100 !== null
      ? Math.round(((input.energyKcalPer100 * input.quantityBase) / 100) / euros)
      : null;
  return { proteinPerEuro, costPer10gProteinCents, caloriesPerEuro };
}
