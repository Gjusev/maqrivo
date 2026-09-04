/**
 * Name normalization for product matching. Deterministic, locale-tolerant
 * (French accents handled), packaging digits preserved.
 */

export function normalizeName(input: string): string {
  return input
    // Ligatures have no NFD decomposition — map them before normalizing.
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (U+0300..U+036F): é → e
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/[^a-z0-9%.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** French structural stop-words: carry no product identity, only noise. */
const STOP_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "d", "l", "au", "aux", "et", "en",
  "a", "un", "une", "duo", "pack",
]);

export function tokenize(input: string): string[] {
  return normalizeName(input)
    // Split digit-letter boundaries so till labels ("1KG") match pack text ("1 kg").
    .replace(/(\d)([a-z%])/g, "$1 $2")
    .replace(/([a-z%])(\d)/g, "$1 $2")
    .split(" ")
    .filter((t) => t.length > 0)
    // Light French plural stem: "filets" ≡ "filet" (tokens of 4+ chars only,
    // so "os"/"riz" style words never lose meaning).
    .map((t) => (t.length >= 4 && t.endsWith("s") ? t.slice(0, -1) : t))
    .filter((t) => !STOP_WORDS.has(t));
}

/** Token-set (Dice) similarity on normalized names: 0..1, deterministic. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}
