/**
 * Locale-aware quantity formatting ("1,5 kg" fr / "1.5 kg" en).
 * Presentation of core quantities, kept in core so rounding rules are tested once.
 */
import type { Quantity } from "./types";
import { dimensionOf } from "./types.ts";

const CULTURAL_UNITS: Record<string, { unit: string; threshold: number; decimals: number }> = {
  // e.g. 1500 g → "1,5 kg" in fr, "1.5 kg" in en
  mass: { unit: "kg", threshold: 1000, decimals: 1 },
  volume: { unit: "l", threshold: 1000, decimals: 1 },
};

export function formatQuantity(q: Quantity, locale: string): string {
  const dim = dimensionOf(q.unit);
  const cultural = CULTURAL_UNITS[dim];
  if (cultural) {
    const baseAmount =
      q.unit === "g" || q.unit === "ml" ? q.amount : q.amount * (q.unit === "kg" || q.unit === "l" ? 1000 : 1);
    if (baseAmount >= cultural.threshold) {
      const big = baseAmount / cultural.threshold;
      return `${formatNumber(big, locale, cultural.decimals)} ${cultural.unit}`;
    }
    if (q.unit !== "g" && q.unit !== "ml") {
      // kg/l below a full kilo/litre: show in base unit
      return `${formatNumber(baseAmount, locale, 0)} ${cultural.threshold === 1000 ? (dim === "mass" ? "g" : "ml") : q.unit}`;
    }
    return `${formatNumber(q.amount, locale, chooseDecimals(q.amount))} ${q.unit}`;
  }
  const rounded = q.amount % 1 === 0 ? q.amount : Number(q.amount.toFixed(2));
  return `${formatNumber(rounded, locale, rounded % 1 === 0 ? 0 : 2)} ${q.unit}`;
}

function chooseDecimals(amount: number): number {
  if (amount >= 100) return 0;
  if (amount >= 10) return amount % 1 === 0 ? 0 : 1;
  return amount % 1 === 0 ? 0 : 1;
}

export function formatNumber(value: number, locale: string, decimals: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}
