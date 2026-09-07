import { describe, expect, it } from "vitest";
import { isJunkLabel } from "../src/server/receipts/extraction";

describe("isJunkLabel anchoring (junk words match whole tokens only)", () => {
  it("keeps groceries that merely contain a junk word as a substring", () => {
    for (const label of ["BONBON", "CARTON DE 6", "DATTE", "POIREAUX"]) {
      expect(isJunkLabel(label), label).toBe(false);
    }
  });

  it("filters labels where a junk word IS the whole token", () => {
    for (const label of ["BON", "CARTE BANCAIRE", "DATE", "POINTS FIDELITE"]) {
      expect(isJunkLabel(label), label).toBe(true);
    }
  });

  it("still filters whole-token junk buried among other tokens", () => {
    for (const label of ["TOTAL A PAYER", "REMISE 2,50", "MERCI ET A BIENTOT"]) {
      expect(isJunkLabel(label), label).toBe(true);
    }
  });

  it("keeps multi-word junk phrases working at the label level", () => {
    // Phrase-only entries must survive the token rewrite: "A PAYER" alone has
    // no single junk token ("a", "payer" are not words in the list).
    expect(isJunkLabel("A PAYER 18,21")).toBe(true);
    expect(isJunkLabel("RENDU MONNAIE 2,50")).toBe(true);
    expect(isJunkLabel("SA AU CAPITAL 500 000 EUR")).toBe(true);
  });

  it("keeps domain-bearing noise filtered", () => {
    expect(isJunkLabel("carrefour.fr")).toBe(true);
    expect(isJunkLabel("WWW.CARREFOUR.FR")).toBe(true);
  });

  it("keeps plural grocery forms that contain junk-word prefixes", () => {
    expect(isJunkLabel("DATES MEDJOOL 500G")).toBe(false);
    expect(isJunkLabel("CARTONS DE 12 OEUFS")).toBe(false);
  });
});
