/**
 * Pure mapping: vision-model JSON → structured catalogue candidates.
 * Fixture-tested; the AI never touches money conversions beyond reading
 * printed euro amounts, and everything here is re-validated deterministically.
 */
import { z } from "zod";

/**
 * Vision models return prices as printed: "4,99 €", "2,45 €/kg", "4.99".
 * Deterministic parse to a euro number; null when nothing numeric exists.
 */
export function parsePrintedPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s|€| /g, "").replace(/,/g, ".");
  const match = /(?:\d+(?:\.\d+)?)/.exec(normalized);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const printedPrice = z
  .unknown()
  .nullish()
  .transform((v) => parsePrintedPrice(v));

export const visionExtractionSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(2).max(200),
        brand: z.string().max(80).nullish(),
        promoPrice: printedPrice,
        regularPrice: printedPrice,
        pricePerKg: printedPrice,
        /** Verbatim French mechanic phrase when printed ("le lot de 2", "2e à -50%"). */
        mechanicPhrase: z.string().max(80).nullish(),
        loyalty: z.union([z.boolean(), z.literal("true"), z.literal("false")]).nullish().transform((v) => v === true || v === "true"),
        position: z.unknown().nullish(),
      }),
    )
    .max(20),
});

export type VisionCandidate = z.infer<typeof visionExtractionSchema>["items"][number];

/** "top-left" → "top"; numbers or junk drop to null (position is cosmetic). */
function normalizePosition(position: unknown): "top" | "middle" | "bottom" | null {
  if (typeof position !== "string") return null;
  const first = position.toLowerCase().split(/[-\s]/)[0];
  return first === "top" || first === "middle" || first === "bottom" ? first : null;
}

export type PromotionMechanism =
  | "PROMO_PRICE"
  | "PERCENTAGE_OFF"
  | "MULTIBUY"
  | "SECOND_UNIT_DISCOUNT"
  | "LOYALTY_PRICE";

export interface CatalogueCandidate {
  index: number;
  description: string;
  brand: string | null;
  mechanism: PromotionMechanism | "OTHER";
  promoPriceCents: number | null;
  regularPriceCents: number | null;
  pricePerKgCents: number | null;
  bundleQty: number | null;
  loyalty: boolean;
  position: "top" | "middle" | "bottom" | null;
}

/** Parse 2.49 / "2,49" / "2,49 €" → cents; null when absent or ambiguous. */
export function eurosToCents(value: unknown): number | null {
  const euros = parsePrintedPrice(value);
  if (euros === null || euros > 10_000) return null;
  return Math.round(euros * 100);
}

/**
 * Classify the deal mechanism from what the page prints. Deterministic:
 * phrase patterns first, then the price shape (barré + promo → PROMO_PRICE).
 */
export function classifyMechanism(
  candidate: VisionCandidate,
): { mechanism: PromotionMechanism | "OTHER"; bundleQty: number | null } {
  const phrase = (candidate.mechanicPhrase ?? "").toLowerCase();
  const bundleMatch = /(?:le lot|lot de|x)\s*(\d{1,2})/.exec(phrase);
  if (/\b2e\b|deuxieme|deuxième/.test(phrase) && /%|-/.test(phrase)) {
    return { mechanism: "SECOND_UNIT_DISCOUNT", bundleQty: null };
  }
  if (bundleMatch) {
    // A lot phrase alone means multi-buy; the bundle price may be the promo.
    return { mechanism: "MULTIBUY", bundleQty: Number(bundleMatch[1]) };
  }
  if (/-\s*\d{1,3}\s*%/.test(phrase)) {
    return { mechanism: "PERCENTAGE_OFF", bundleQty: null };
  }
  if (candidate.loyalty || /prix carte|carte fid|fidélité|fidelite/.test(phrase)) {
    return { mechanism: "LOYALTY_PRICE", bundleQty: null };
  }
  if (candidate.regularPrice != null && candidate.promoPrice != null && candidate.promoPrice < candidate.regularPrice) {
    return { mechanism: "PROMO_PRICE", bundleQty: null };
  }
  if (candidate.promoPrice != null) {
    return { mechanism: "PROMO_PRICE", bundleQty: null };
  }
  return { mechanism: "OTHER", bundleQty: null };
}

export function candidatesFromExtraction(output: unknown): CatalogueCandidate[] {
  const parsed = visionExtractionSchema.safeParse(output);
  if (!parsed.success) return [];
  return parsed.data.items
    .filter((item) => item.promoPrice != null || item.regularPrice != null || item.pricePerKg != null)
    .map((item, index) => {
      const { mechanism, bundleQty } = classifyMechanism(item);
      return {
        index,
        description: item.description.trim(),
        brand: item.brand?.trim() || null,
        mechanism,
        promoPriceCents: eurosToCents(item.promoPrice),
        regularPriceCents: eurosToCents(item.regularPrice),
        pricePerKgCents: eurosToCents(item.pricePerKg),
        bundleQty,
        loyalty: Boolean(item.loyalty),
        position: normalizePosition(item.position),
      };
    })
    .filter((c) => c.promoPriceCents !== null || c.regularPriceCents !== null || c.pricePerKgCents !== null);
}
