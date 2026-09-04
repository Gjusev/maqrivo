/**
 * Normalized promotion model covering real French supermarket mechanics.
 * Mechanisms stay structured: a MULTI_BUY is evaluated per purchased count,
 * never flattened into a fake universal percentage.
 */

export type PromotionMechanism =
  /** Direct promotional price per unit ("prix promo"). */
  | { readonly kind: "PROMO_PRICE"; readonly promoPriceCents: number }
  /** Percentage off per unit ("−30 %"). */
  | { readonly kind: "PERCENTAGE_OFF"; readonly percent: number }
  /** Bundle price for N units ("le lot de 2 à 5 €", "3 pour 10 €"). */
  | { readonly kind: "MULTIBUY"; readonly bundleQty: number; readonly bundlePriceCents: number }
  /** Buy X get Y free ("le 3e gratuit", "2 achetés = 1 offert"). */
  | { readonly kind: "BUY_X_GET_Y"; readonly buyQty: number; readonly freeQty: number }
  /** Second unit (or further units) at a percentage off ("le 2e à 50 %"). */
  | { readonly kind: "SECOND_UNIT_DISCOUNT"; readonly percent: number }
  /** Flat price per unit with the retailer's loyalty card ("prix carte"). */
  | { readonly kind: "LOYALTY_PRICE"; readonly promoPriceCents: number }
  /** Loyalty credit on the basket, once per transaction ("5 € de bonus carte"). */
  | { readonly kind: "LOYALTY_CREDIT"; readonly creditCents: number }
  /** Cashback credit on the basket, once. */
  | { readonly kind: "CASHBACK"; readonly creditCents: number }
  /** Coupon: flat basket discount, optionally with a minimum basket. */
  | {
      readonly kind: "COUPON";
      readonly discountCents: number;
      readonly minBasketCents: number | null;
    }
  /** Percentage off applied to a whole category. */
  | { readonly kind: "CATEGORY_PROMO"; readonly percent: number };

export type MechanismKind = PromotionMechanism["kind"];

/** Mechanisms that reduce the item line directly, per purchased count. */
export const LINE_MECHANISMS: readonly MechanismKind[] = [
  "PROMO_PRICE",
  "PERCENTAGE_OFF",
  "MULTIBUY",
  "BUY_X_GET_Y",
  "SECOND_UNIT_DISCOUNT",
  "LOYALTY_PRICE",
  "CATEGORY_PROMO",
];

/** Mechanisms that act once at basket level, not per line. */
export const BASKET_MECHANISMS: readonly MechanismKind[] = [
  "LOYALTY_CREDIT",
  "CASHBACK",
  "COUPON",
];

export interface PromotionWindow {
  readonly validFrom: string | null; // ISO date (local retailer dates)
  readonly validUntil: string | null;
}

export type PromotionState = "active" | "upcoming" | "expired" | "unknown";
