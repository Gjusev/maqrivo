import { describe, expect, it } from "vitest";
import { isJunkLabel, receiptLinesFromExtraction } from "../src/server/receipts/extraction";

describe("isJunkLabel (French till noise)", () => {
  it("filters totals, payment, legal and courtesy lines", () => {
    for (const label of [
      "TOTAL A PAYER",
      "TOTAL 18,21",
      "TVA 5,5%",
      "PAIEMENT CB",
      "CARTE BANCAIRE",
      "SOLDE CARTE",
      "MERCI DE VOTRE VISITE",
      "SIRET 123 456 789 00012",
      "www.carrefour.fr",
      "POINTS FIDELITE 120",
      "CAISSE 4",
      "04/09/2026 18:42",
      "42",
    ]) {
      expect(isJunkLabel(label), label).toBe(true);
    }
  });

  it("keeps real product lines", () => {
    for (const label of [
      "FILET POULET 600G",
      "LAIT ENTIER 1L",
      "POIREAUX 0.642 KG",
      "YAOURT NATURE X16",
    ]) {
      expect(isJunkLabel(label), label).toBe(false);
    }
  });
});

describe("receiptLinesFromExtraction", () => {
  it("maps a realistic vision payload with French price strings", () => {
    const output = {
      lines: [
        { label: "CARREFOUR MARKET", amount: null },
        { label: "FILET POULET 600G", amount: "4,99 €", quantityKg: null },
        { label: "POIREAUX", amount: "1,93 €", quantityKg: "0.642" },
        { label: "LAIT ENTIER 1L", amount: 1.05 },
        { label: "TOTAL", amount: "18,21 €" },
        { label: "PAIEMENT CB", amount: "18,21 €" },
        { label: "BAGUETTE TRADITION", amount: null },
      ],
    };
    const lines = receiptLinesFromExtraction(output);
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatchObject({ label: "FILET POULET 600G", amountCents: 499, perKgCents: null });
    // 1.93 € / 0.642 kg = 3.006… €/kg → 301 c/kg
    expect(lines[1]).toMatchObject({ amountCents: 193, quantityKg: 0.642, perKgCents: 301 });
    expect(lines[2]).toMatchObject({ label: "LAIT ENTIER 1L", amountCents: 105 });
  });

  it("returns [] on garbage", () => {
    expect(receiptLinesFromExtraction({ nothing: true })).toEqual([]);
    expect(receiptLinesFromExtraction("oops")).toEqual([]);
  });

  it("drops zero/negative amounts", () => {
    const lines = receiptLinesFromExtraction({
      lines: [
        { label: "PATES PENNE", amount: 0 },
        { label: "REMISE", amount: -1.5 },
      ],
    });
    expect(lines.length).toBe(0);
  });
});
