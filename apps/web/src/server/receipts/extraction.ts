/**
 * Pure mapping: receipt vision JSON → candidate purchase lines.
 * Junk lines (totals, payments, legal footer) are filtered deterministically;
 * only the user's confirmation turns a line into recorded truth.
 */
import { z } from "zod";
import { eurosToCents } from "../catalogues/extraction";

export const receiptVisionSchema = z.object({
  lines: z
    .array(
      z.object({
        label: z.string().min(1).max(160),
        amount: z.unknown().nullish(),
        quantityKg: z.coerce.number().nonnegative().max(100).nullish(),
      }),
    )
    .max(80),
});

export type VisionLine = z.infer<typeof receiptVisionSchema>["lines"][number];

export interface ReceiptLineCandidate {
  index: number;
  label: string;
  amountCents: number;
  /** Kilograms when the scale printed a weight (prix au kg lines). */
  quantityKg: number | null;
  /** Per-kg price in cents when both amount and weight are known. */
  perKgCents: number | null;
}

/**
 * Receipt noise that must never become a price line. French till vocabulary.
 * Single words match WHOLE tokens only — a junk word as a substring is not
 * junk (BONBON is not BON, CARTON is not CARTE, DATTE is not DATE).
 * Phrases (multi-word or punctuation-bearing) match the whole label.
 */
const JUNK_WORD = new RegExp(
  `^(?:${[
    "total", "tva", "taxe", "montant", "paiement", "cb", "visa", "mastercard",
    "esp[eè]ces", "cheque", "chèque", "rendu", "solde", "nan", "point",
    "points", "fidelite", "fidélité", "carte", "client", "euro", "reduction",
    "réduction", "remise", "bon", "offre", "ticket", "recu", "reçu", "siret",
    "ape", "naf", "sarl", "t[eé]l", "www", "http", "adresse", "merci",
    "serveur", "caisse", "numero", "numéro", "n°", "date", "heure", "hier",
    "aujourd", "facture", "francs", "motive", "bienvenue", "smiley",
  ].join("|")})$`,
  "i",
);

const JUNK_PHRASE = new RegExp(
  [
    "a payer", "à payer", "carte bancaire", "rendu monnaie", "sa au capital",
    "code postal", "euros? en caisse", "a bient[oô]t", "à bient[oô]t",
    "//", "\\.fr", "\\.com",
  ].join("|"),
  "i",
);

export function isJunkLabel(label: string): boolean {
  const normalized = label.trim();
  if (normalized.length < 3) return true;
  // Pure numbers/punctuation (dates, times, amounts alone)
  if (!/[a-zà-ÿ]{2}/i.test(normalized)) return true;
  const tokens = normalized.toLowerCase().split(/[^a-zà-ÿ0-9°]+/).filter(Boolean);
  if (tokens.some((token) => JUNK_WORD.test(token))) return true;
  return JUNK_PHRASE.test(normalized.toLowerCase().replace(/\s+/g, " "));
}

export function receiptLinesFromExtraction(output: unknown): ReceiptLineCandidate[] {
  const parsed = receiptVisionSchema.safeParse(output);
  if (!parsed.success) return [];
  const candidates: ReceiptLineCandidate[] = [];
  for (const line of parsed.data.lines) {
    const amountCents = eurosToCents(line.amount);
    if (amountCents === null || amountCents <= 0) continue;
    const label = line.label.trim();
    if (isJunkLabel(label)) continue;
    const quantityKg =
      typeof line.quantityKg === "number" && line.quantityKg > 0.001
        ? Math.round(line.quantityKg * 1000) / 1000
        : null;
    candidates.push({
      index: candidates.length,
      label,
      amountCents,
      quantityKg,
      perKgCents: quantityKg !== null ? Math.round(amountCents / quantityKg) : null,
    });
    if (candidates.length >= 60) break;
  }
  return candidates;
}
