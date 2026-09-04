import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  money,
  multiply,
  perPiece,
  pricePer100gFromKg,
  pricePerKgFrom100g,
  roundHalfUp,
  subtract,
  sum,
} from "../src/money/money";
import { formatMoney } from "../src/money/format";

describe("money construction and arithmetic", () => {
  it("rejects non-integer cents", () => {
    expect(() => money(1.5)).toThrow(/integer cents/);
  });

  it("adds and subtracts in cents", () => {
    expect(add(money(199), money(100)).amountCents).toBe(299);
    expect(subtract(money(199), money(100)).amountCents).toBe(99);
  });

  it("refuses currency mixing", () => {
    expect(() => add(money(100, "EUR"), money(100, "USD"))).toThrow(/mismatch/);
  });

  it("multiplies only by integers", () => {
    expect(multiply(money(249), 3).amountCents).toBe(747);
    expect(() => multiply(money(249), 1.5)).toThrow(/integer/);
  });

  it("sums a basket", () => {
    expect(sum([money(199), money(249), money(890)]).amountCents).toBe(1338);
    expect(sum([]).amountCents).toBe(0);
  });

  it("compares", () => {
    expect(compare(money(199), money(249))).toBeLessThan(0);
    expect(compare(money(199), money(199))).toBe(0);
  });
});

describe("money rounding and allocation", () => {
  it("rounds half up", () => {
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-1.5)).toBe(-2);
    expect(roundHalfUp(1.4)).toBe(1);
  });

  it("splits without losing cents (largest remainder)", () => {
    const parts = allocate(money(100), [1, 1, 1]);
    const total = parts.reduce((acc, p) => acc + p.amountCents, 0);
    expect(total).toBe(100);
    expect(parts.map((p) => p.amountCents)).toEqual([34, 33, 33]);
  });

  it("allocates weighted splits exactly", () => {
    // 2:1 split of €1.00 → 67/33 (exact would be 66.67/33.33)
    const parts = allocate(money(100), [2, 1]);
    expect(parts[0]!.amountCents + parts[1]!.amountCents).toBe(100);
    expect(parts.map((p) => p.amountCents)).toEqual([67, 33]);
  });

  it("derives per-piece prices rounded half up", () => {
    // 3 for €5 → €1.67 per piece (166.67 → 167)
    expect(perPiece(money(500), 3).amountCents).toBe(167);
    // 6 for €5 → €0.83 (83.33 → 83)
    expect(perPiece(money(500), 6).amountCents).toBe(83);
  });
});

describe("price per kilo conversions", () => {
  it("converts per-kg to per-100g and back", () => {
    // Butcher chicken €8.90/kg → €0.89 per 100 g
    expect(pricePer100gFromKg(890)).toBe(89);
    expect(pricePerKgFrom100g(89)).toBe(890);
  });

  it("rounds half up on odd per-kg prices", () => {
    // €7.95/kg → 79.5 c per 100 g → 80
    expect(pricePer100gFromKg(795)).toBe(80);
  });
});

describe("locale-aware money formatting", () => {
  // fr-FR inserts a narrow no-break space (U+202F) between number and currency
  it("formats EUR in French as 1,99 EUR-sign", () => {
    expect(formatMoney(money(199), "fr")).toMatch(/^1,99[\s  ]€$/);
  });

  it("formats EUR in English as EUR-sign1.99", () => {
    expect(formatMoney(money(199), "en")).toBe("€1.99");
  });

  it("formats thousands with grouping space in fr", () => {
    const fr = formatMoney(money(123456), "fr");
    expect(fr).toMatch(/1[\s  ]?234,56[\s  ]€/);
  });

  it("zero cents stays clean", () => {
    expect(formatMoney(money(4200), "fr")).toContain("42,00");
  });
});
