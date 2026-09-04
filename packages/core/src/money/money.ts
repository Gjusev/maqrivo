/**
 * Money as integer minor units (cents). No floats anywhere in arithmetic:
 * all operations stay in cents; derived rates are computed with explicit
 * rounding (half up, matching shelf-price conventions) at the boundary.
 */

export type CurrencyCode = string; // ISO 4217, "EUR" initially

export interface Money {
  readonly amountCents: number;
  readonly currency: CurrencyCode;
}

export type PriceBasis = "unit" | "per_kg" | "per_100g" | "per_l" | "per_100ml";

export function money(amountCents: number, currency: CurrencyCode = "EUR"): Money {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`Money must be integer cents, got ${String(amountCents)}`);
  }
  return { amountCents, currency };
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents + b.amountCents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents - b.amountCents, a.currency);
}

export function multiply(m: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new Error(`Money factor must be an integer, got ${String(factor)}`);
  }
  return money(m.amountCents * factor, m.currency);
}

/** Sum of a list; empty list is zero of the given currency. */
export function sum(list: readonly Money[], currency: CurrencyCode = "EUR"): Money {
  return list.reduce<Money>((acc, m) => add(acc, m), money(0, currency));
}

/**
 * Split a total across weights so the parts always sum exactly to the total
 * (largest-remainder method): floor shares first, then hand the leftover
 * cents to the largest fractional remainders. No cent is created or lost.
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error(`allocate weights must sum to a positive value, got ${String(totalWeight)}`);
  const exact = weights.map((w) => (m.amountCents * w) / totalWeight);
  const floors = exact.map((v) => Math.floor(v));
  let leftover = m.amountCents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  for (const { i } of order) {
    if (leftover <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    leftover -= 1;
  }
  return result.map((cents) => money(cents, m.currency));
}

/** Per-piece price from a total over a quantity, rounded half up. */
export function perPiece(total: Money, pieces: number): Money {
  if (pieces <= 0) throw new Error(`perPiece needs a positive count, got ${String(pieces)}`);
  return money(roundHalfUp(total.amountCents / pieces), total.currency);
}

export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountCents - b.amountCents;
}

/** "Prix au kilo" conversions between the two common per-mass bases. */
export function pricePer100gFromKg(perKgCents: number): number {
  return roundHalfUp(perKgCents / 10);
}

export function pricePerKgFrom100g(per100gCents: number): number {
  return roundHalfUp(per100gCents * 10);
}
