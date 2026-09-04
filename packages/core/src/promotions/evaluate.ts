/**
 * Deterministic promotion evaluation: what does this mechanism actually cost
 * for a given purchased count, unit price, and loyalty-card state?
 */
import type { PromotionMechanism, PromotionState, PromotionWindow } from "./types";

export interface EffectiveCostInput {
  readonly mechanism: PromotionMechanism;
  readonly unitPriceCents: number;
  readonly count: number;
  readonly hasLoyaltyCard: boolean;
}

export interface EffectiveCost {
  /** Total line cost for `count` units after the mechanism. */
  readonly totalCents: number;
  /** Effective per-unit price (rounded half up), for comparison and display. */
  readonly perUnitCents: number;
  /** True when the mechanism actually reduced the price for this count. */
  readonly applied: boolean;
  /** Basket-level credit (LOYALTY_CREDIT / CASHBACK / COUPON), once. */
  readonly basketCreditCents: number;
  /** Loyalty requirement that blocked application, if any. */
  readonly requiresLoyalty: boolean;
}

const roundHalfUp = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

export function effectiveCost(input: EffectiveCostInput): EffectiveCost {
  const { mechanism: m, unitPriceCents, count } = input;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`count must be a non-negative integer, got ${String(count)}`);
  }
  if (unitPriceCents < 0) throw new Error("unitPriceCents must be non-negative");

  let totalCents = count * unitPriceCents;
  let applied = false;
  let basketCreditCents = 0;
  let requiresLoyalty = false;

  switch (m.kind) {
    case "PROMO_PRICE":
    case "LOYALTY_PRICE": {
      if (m.kind === "LOYALTY_PRICE" && !input.hasLoyaltyCard) {
        requiresLoyalty = true;
        break;
      }
      totalCents = count * m.promoPriceCents;
      applied = m.promoPriceCents < unitPriceCents && count > 0;
      break;
    }
    case "PERCENTAGE_OFF":
    case "CATEGORY_PROMO": {
      totalCents = roundHalfUp(count * unitPriceCents * (1 - m.percent / 100));
      applied = m.percent > 0 && count > 0;
      break;
    }
    case "MULTIBUY": {
      // "2 for €5": complete bundles at bundle price, remainder at shelf price.
      const bundles = Math.floor(count / m.bundleQty);
      const remainder = count % m.bundleQty;
      totalCents = bundles * m.bundlePriceCents + remainder * unitPriceCents;
      applied = bundles > 0 && m.bundlePriceCents < m.bundleQty * unitPriceCents;
      break;
    }
    case "BUY_X_GET_Y": {
      // "Buy 2 get 1 free": per group of (X+Y) pay X; partial groups at shelf price.
      const group = m.buyQty + m.freeQty;
      const groups = Math.floor(count / group);
      const remainder = count % group;
      totalCents = groups * m.buyQty * unitPriceCents + remainder * unitPriceCents;
      applied = groups > 0;
      break;
    }
    case "SECOND_UNIT_DISCOUNT": {
      // Every second unit at percent off: 2 → 1 + 0.5 units, 3 → 2 + 0.5, …
      const discountedUnits = Math.floor(count / 2);
      const fullUnits = count - discountedUnits;
      totalCents =
        fullUnits * unitPriceCents + roundHalfUp(discountedUnits * unitPriceCents * (1 - m.percent / 100));
      applied = discountedUnits > 0;
      break;
    }
    case "LOYALTY_CREDIT":
    case "CASHBACK": {
      if (!input.hasLoyaltyCard) {
        requiresLoyalty = true;
        break;
      }
      basketCreditCents = count > 0 ? m.creditCents : 0;
      applied = count > 0 && m.creditCents > 0;
      break;
    }
    case "COUPON": {
      if (count > 0) {
        basketCreditCents = m.discountCents;
        applied = m.discountCents > 0;
      }
      break;
    }
  }

  return {
    totalCents,
    perUnitCents: count > 0 ? roundHalfUp(totalCents / count) : unitPriceCents,
    applied,
    basketCreditCents,
    requiresLoyalty,
  };
}

/** Date-window state. Dates are local retailer dates (ISO yyyy-mm-dd). */
export function promotionState(window: PromotionWindow, todayIso: string): PromotionState {
  const { validFrom, validUntil } = window;
  if (validFrom === null && validUntil === null) return "unknown";
  if (validUntil !== null && validUntil < todayIso) return "expired";
  if (validFrom !== null && validFrom > todayIso) return "upcoming";
  return "active";
}

/** Savings vs the regular shelf price, in cents. Never negative. */
export function savingsCents(input: EffectiveCostInput, regularPriceCents: number): number {
  const result = effectiveCost(input);
  if (!result.applied) return 0;
  const regular = input.count * regularPriceCents;
  return Math.max(0, regular - result.totalCents + result.basketCreditCents);
}
