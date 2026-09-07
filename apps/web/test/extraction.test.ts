import { describe, expect, it } from "vitest";
import { candidatesFromExtraction, classifyMechanism, eurosToCents, parsePrintedDate } from "../src/server/catalogues/extraction";
import type { VisionCandidate } from "../src/server/catalogues/extraction";

const asCandidate = (v: Record<string, unknown>): VisionCandidate =>
  v as unknown as VisionCandidate;

const base = {
  description: "Filets de poulet 600 g",
  brand: null,
  mechanicPhrase: null,
  loyalty: false,
  position: null,
};

describe("eurosToCents", () => {
  it("converts and rounds", () => {
    expect(eurosToCents(2.49)).toBe(249);
    expect(eurosToCents(0.995)).toBe(100); // rounds half up, never 99.499…
    expect(eurosToCents(0)).toBe(0);
    expect(eurosToCents(null)).toBeNull();
    expect(eurosToCents(undefined)).toBeNull();
    expect(eurosToCents(-1)).toBeNull();
    expect(eurosToCents(999_999)).toBeNull();
  });
});

describe("classifyMechanism", () => {
  it("prix barré → PROMO_PRICE", () => {
    const r = classifyMechanism(asCandidate({ ...base, promoPrice: 4.99, regularPrice: 6.49 }));
    expect(r.mechanism).toBe("PROMO_PRICE");
  });

  it("le lot de 2 → MULTIBUY", () => {
    const r = classifyMechanism(asCandidate({ ...base, promoPrice: 5, mechanicPhrase: "le lot de 2 pour 5€" }));
    expect(r.mechanism).toBe("MULTIBUY");
    expect(r.bundleQty).toBe(2);
  });

  it("2e à -50% → SECOND_UNIT_DISCOUNT", () => {
    const r = classifyMechanism(asCandidate({ ...base, mechanicPhrase: "2e à -50%" }));
    expect(r.mechanism).toBe("SECOND_UNIT_DISCOUNT");
  });

  it("-30% → PERCENTAGE_OFF", () => {
    const r = classifyMechanism(asCandidate({ ...base, mechanicPhrase: "-30% sur les pâtes" }));
    expect(r.mechanism).toBe("PERCENTAGE_OFF");
  });

  it("prix carte → LOYALTY_PRICE", () => {
    const r = classifyMechanism(asCandidate({ ...base, promoPrice: 3.89, mechanicPhrase: "prix carte" }));
    expect(r.mechanism).toBe("LOYALTY_PRICE");
  });
});

describe("discountPct derivation", () => {
  it("-30% → PERCENTAGE_OFF with discountPct 30, propagated into the candidate", () => {
    const r = classifyMechanism(asCandidate({ ...base, mechanicPhrase: "-30% sur les pâtes" }));
    expect(r).toMatchObject({ mechanism: "PERCENTAGE_OFF", discountPct: 30 });
    const candidates = candidatesFromExtraction({
      items: [{ description: "Pâtes penne 500 g", mechanicPhrase: "-30%", promoPrice: null, regularPrice: 1.49 }],
    });
    expect(candidates[0]).toMatchObject({ mechanism: "PERCENTAGE_OFF", discountPct: 30, promoPriceCents: null, regularPriceCents: 149 });
  });

  it("deuxième à -50% → SECOND_UNIT_DISCOUNT keeps discountPct null (solver defaults to 50)", () => {
    const r = classifyMechanism(asCandidate({ ...base, mechanicPhrase: "deuxième à -50%" }));
    expect(r).toMatchObject({ mechanism: "SECOND_UNIT_DISCOUNT", discountPct: null });
  });

  it("2ème à -50% (accented, the form leaflets actually print) → SECOND_UNIT_DISCOUNT", () => {
    const r = classifyMechanism(asCandidate({ ...base, mechanicPhrase: "2ème à -50%" }));
    expect(r).toMatchObject({ mechanism: "SECOND_UNIT_DISCOUNT", discountPct: null });
  });

  it("le lot de 2 → MULTIBUY keeps discountPct null", () => {
    const r = classifyMechanism(asCandidate({ ...base, promoPrice: 5, mechanicPhrase: "le lot de 2 pour 5€" }));
    expect(r).toMatchObject({ mechanism: "MULTIBUY", bundleQty: 2, discountPct: null });
  });

  it("barré 4.99/2.99 sans phrase → PROMO_PRICE keeps discountPct null", () => {
    const r = classifyMechanism(asCandidate({ ...base, promoPrice: 2.99, regularPrice: 4.99 }));
    expect(r).toMatchObject({ mechanism: "PROMO_PRICE", discountPct: null });
  });
});

describe("parsePrintedPrice via schema (French strings from vision)", () => {
  it("parses French formatted prices", () => {
    const candidates = candidatesFromExtraction({
      items: [
        { description: "Filets de poulet 600 g", promoPrice: "4,99 €", regularPrice: "6,49 €" },
        { description: "Pommes Gala", pricePerKg: "2,45 €/kg" },
        { description: "Jus 1L", promoPrice: "2.19" },
      ],
    });
    expect(candidates[0]).toMatchObject({ promoPriceCents: 499, regularPriceCents: 649 });
    expect(candidates[1]).toMatchObject({ pricePerKgCents: 245 });
    expect(candidates[2]).toMatchObject({ promoPriceCents: 219 });
  });
});

describe("candidatesFromExtraction (fixture-shaped vision output)", () => {
  it("maps a realistic glm vision payload to structured candidates", () => {
    const output = {
      items: [
        { description: "Filets de poulet 600 g", brand: "Carrefour", promoPrice: "4.99", regularPrice: "6.49", mechanicPhrase: null, loyalty: false, position: "top" },
        { description: "Yaourts nature x16", promoPrice: 3.29, regularPrice: 4.09, mechanicPhrase: "le lot de 2", loyalty: false },
        { description: "Pâtes penne 500 g", mechanicPhrase: "-30%", promoPrice: null, regularPrice: 1.49 },
        { description: "Pur jus d'orange 1L", promoPrice: 2.19, regularPrice: 2.89, mechanicPhrase: "prix carte", loyalty: true, position: "middle" },
        { description: "Recette du chef (pas un prix)", promoPrice: null, regularPrice: null },
      ],
    };
    const candidates = candidatesFromExtraction(output);
    expect(candidates.length).toBe(4); // the no-price text block drops out
    expect(candidates[0]).toMatchObject({ mechanism: "PROMO_PRICE", promoPriceCents: 499, regularPriceCents: 649 });
    expect(candidates[1]!.mechanism).toBe("MULTIBUY");
    // -30% with no amounts: kept as a candidate (prices null) — user fills in
    expect(candidates[2]).toMatchObject({ mechanism: "PERCENTAGE_OFF", promoPriceCents: null });
    expect(candidates[3]!.mechanism).toBe("LOYALTY_PRICE");
  });

  it("maps v2 fields: packSize and printed end dates", () => {
    const candidates = candidatesFromExtraction({
      items: [
        { description: "Café moulu", promoPrice: "5,99 €", packSize: "500 g", validUntil: "18/09/2026" },
        { description: "Soda cola", promoPrice: "1,99 €", packSize: "6x330 ml", validUntil: "18/09" },
        { description: "Beurre", promoPrice: "2,10 €" },
      ],
    });
    expect(candidates[0]).toMatchObject({ packSize: "500 g", validUntil: "2026-09-18" });
    expect(candidates[1]).toMatchObject({ packSize: "6x330 ml", validUntil: "2026-09-18" }); // year inferred
    expect(candidates[2]).toMatchObject({ packSize: null, validUntil: null });
  });
});

describe("parsePrintedDate", () => {
  it("normalizes ISO, full and short French dates", () => {
    expect(parsePrintedDate("2026-09-18")).toBe("2026-09-18");
    expect(parsePrintedDate("18/09/2026")).toBe("2026-09-18");
    expect(parsePrintedDate("5/10/26")).toBe("2026-10-05");
  });

  it("infers the year for day/month-only prints (leaflets look forward)", () => {
    const now = new Date();
    const futureMonth = ((now.getMonth() + 7) % 12) + 1; // ~7 months ahead
    const result = parsePrintedDate(`01/${String(futureMonth).padStart(2, "0")}`);
    expect(result).toBe(`${String(now.getFullYear())}-${String(futureMonth).padStart(2, "0")}-01`);
  });

  it("rejects non-dates", () => {
    expect(parsePrintedDate("prix")).toBeNull();
    expect(parsePrintedDate(null)).toBeNull();
    expect(parsePrintedDate("18-13")).toBeNull();
  });
});

describe("candidatesFromExtraction robustness", () => {
  it("returns [] on garbage", () => {
    expect(candidatesFromExtraction({ nothing: true })).toEqual([]);
    expect(candidatesFromExtraction("oops")).toEqual([]);
  });
});
