/**
 * Unit system for food quantities.
 *
 * Dimensions: mass (g, kg), volume (ml, l), count (unit, pack).
 * Base units are grams, millilitres, and pieces; conversions inside a
 * dimension use exact factors (×1000) so no precision is lost.
 */

export const MASS_UNITS = ["g", "kg"] as const;
export const VOLUME_UNITS = ["ml", "l"] as const;
export const COUNT_UNITS = ["unit", "pack"] as const;

export type MassUnit = (typeof MASS_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type CountUnit = (typeof COUNT_UNITS)[number];

export type Unit = MassUnit | VolumeUnit | CountUnit;
export type Dimension = "mass" | "volume" | "count";

export interface Quantity {
  readonly amount: number;
  readonly unit: Unit;
}

export function dimensionOf(unit: Unit): Dimension {
  if ((MASS_UNITS as readonly string[]).includes(unit)) return "mass";
  if ((VOLUME_UNITS as readonly string[]).includes(unit)) return "volume";
  return "count";
}

export function isCompatible(a: Unit, b: Unit): boolean {
  return dimensionOf(a) === dimensionOf(b);
}

/** Exact conversion factor from one unit to another within a dimension. */
export function conversionFactor(from: Unit, to: Unit): number {
  if (!isCompatible(from, to)) {
    throw new Error(`Incompatible units: ${from} → ${to}`);
  }
  const table: Record<Unit, number> = { g: 1, kg: 1000, ml: 1, l: 1000, unit: 1, pack: 1 };
  return table[from] / table[to];
}

export function convert(amount: number, from: Unit, to: Unit): number {
  return amount * conversionFactor(from, to);
}

/** Express a quantity in its dimension's base unit (g, ml, or unit). */
export function toBase(quantity: Quantity): Quantity {
  const base: Record<Dimension, Unit> = { mass: "g", volume: "ml", count: "unit" };
  const target = base[dimensionOf(quantity.unit)];
  if (quantity.unit === target) return quantity;
  return { amount: convert(quantity.amount, quantity.unit, target), unit: target };
}

export function quantity(amount: number, unit: Unit): Quantity {
  if (!Number.isFinite(amount)) throw new Error(`Quantity amount must be finite: ${String(amount)}`);
  return { amount, unit };
}
