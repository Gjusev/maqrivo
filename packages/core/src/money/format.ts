/**
 * Locale-aware money formatting via Intl — the single source of "1,99 €" (fr)
 * vs "€1.99" (en). Always formats from integer cents.
 */
import type { Money } from "./money";

export function formatMoney(m: Money, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(m.amountCents / 100);
}

/** Whole-euro rounding for large totals ("42 €" reads better than "42,00 €"). */
export function formatMoneyShort(m: Money, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: m.amountCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(m.amountCents / 100);
}
