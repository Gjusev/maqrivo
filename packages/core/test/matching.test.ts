import { describe, expect, it } from "vitest";
import { normalizeName, similarity, tokenize } from "../src/matching/normalize";
import { resolveProduct, type ProductCandidate } from "../src/matching/resolve";

function candidate(partial: Partial<ProductCandidate> & { id: string; name: string }): ProductCandidate {
  return {
    brand: null,
    barcode: null,
    retailerProductIds: {},
    packageQuantity: null,
    packageUnit: null,
    ...partial,
  };
}

describe("name normalization", () => {
  it("strips French diacritics and case", () => {
    expect(normalizeName("Filets de Poulet")).toBe("filets de poulet");
    expect(normalizeName("Poulet rôti fermier")).toBe("poulet roti fermier");
    expect(normalizeName("Œufs frais")).toBe("oeufs frais");
  });

  it("keeps packaging digits and units", () => {
    expect(normalizeName("Poulet 600g")).toBe("poulet 600g");
    expect(normalizeName("Lait 1,5% 1L")).toBe("lait 1,5% 1l");
  });

  it("collapses separators", () => {
    expect(normalizeName("  Poulet    Fermier  ")).toBe("poulet fermier");
    expect(normalizeName("Dinde-Hachée")).toBe("dinde hachee");
  });

  it("splits digit-letter boundaries — till labels match pack text", () => {
    expect(tokenize("RIZ BASMATI 1KG")).toEqual(["riz", "basmati", "1", "kg"]);
    expect(similarity("RIZ BASMATI 1KG", "Riz basmati 1 kg")).toBe(1);
  });

  it("stems French plurals — FILET matches Filets", () => {
    expect(tokenize("FILETS")).toEqual(["filet"]);
    expect(similarity("FILET POULET 600G", "Filets de poulet 600 g")).toBeGreaterThan(0.7);
  });

  it("drops French stop-words — POULET matches Filets de poulet", () => {
    expect(tokenize("Filets de poulet 600 g")).toEqual(["filet", "poulet", "600", "g"]);
    expect(similarity("FILET POULET 600G", "Filets de poulet 600 g")).toBe(1);
  });

  it("similarity is symmetric and 0..1", () => {
    const a = similarity("Filets de poulet", "Filet de poulet");
    expect(a).toBeGreaterThan(0.5);
    expect(a).toBeLessThanOrEqual(1);
    expect(similarity("Poulet", "Poulet")).toBe(1);
    expect(similarity("Poulet", "Riz")).toBe(0);
  });
});

describe("ProductResolution", () => {
  const carrefourChicken = candidate({
    id: "p1",
    name: "Filets de poulet",
    brand: "Carrefour",
    barcode: "3560070976422",
    packageQuantity: 600,
    packageUnit: "g",
  });
  const lidlChicken = candidate({
    id: "p2",
    name: "Filets de poulet",
    brand: "Metro Chef",
    packageQuantity: 1000,
    packageUnit: "g",
  });

  it("EXACT on barcode", () => {
    const r = resolveProduct(
      { name: "n'importe quoi", brand: null, barcode: "3560070976422", retailerId: null, retailerProductId: null, packageQuantity: null, packageUnit: null },
      [carrefourChicken, lidlChicken],
    );
    expect(r.state).toBe("EXACT");
    expect(r.productId).toBe("p1");
    expect(r.matchedBy).toBe("barcode");
  });

  it("EXACT on retailer product id", () => {
    const withRetailerId = candidate({
      id: "p3",
      name: "Escalopes de dinde",
      retailerProductIds: { carrefour: "CAR-42" },
    });
    const r = resolveProduct(
      { name: "Escalopes", brand: null, barcode: null, retailerId: "carrefour", retailerProductId: "CAR-42", packageQuantity: null, packageUnit: null },
      [withRetailerId],
    );
    expect(r.state).toBe("EXACT");
    expect(r.matchedBy).toBe("retailer_id");
  });

  it("PROBABLE on brand + name + packaging", () => {
    const r = resolveProduct(
      { name: "Filets de poulet", brand: "Carrefour", barcode: null, retailerId: null, retailerProductId: null, packageQuantity: 600, packageUnit: "g" },
      [carrefourChicken, lidlChicken],
    );
    expect(r.state).toBe("PROBABLE");
    expect(r.productId).toBe("p1");
  });

  it("AMBIGUOUS when two candidates are equally plausible", () => {
    const twinA = candidate({ id: "a", name: "Yaourt nature", brand: "Danone" });
    const twinB = candidate({ id: "b", name: "Yaourt nature", brand: "Danone" });
    const r = resolveProduct(
      { name: "Yaourt nature", brand: "Danone", barcode: null, retailerId: null, retailerProductId: null, packageQuantity: null, packageUnit: null },
      [twinA, twinB],
    );
    expect(r.state).toBe("AMBIGUOUS");
    expect(r.productId).toBeNull();
    expect(r.tiedCandidates).toContain("a");
    expect(r.tiedCandidates).toContain("b");
  });

  it("missing brand on one side is neutral — till labels still match", () => {
    // Receipt labels carry no brand; that must not sink an otherwise exact name.
    const r = resolveProduct(
      { name: "RIZ BASMATI 1KG", brand: null, barcode: null, retailerId: null, retailerProductId: null, packageQuantity: null, packageUnit: null },
      [carrefourChicken, candidate({ id: "riz", name: "Riz basmati 1 kg", brand: "Carrefour" })],
    );
    expect(r.state).toBe("PROBABLE");
    expect(r.productId).toBe("riz");
  });

  it("UNRESOLVED when nothing is close enough — better no match than a wrong one", () => {
    const r = resolveProduct(
      { name: "Bouteille de gaz", brand: null, barcode: null, retailerId: null, retailerProductId: null, packageQuantity: null, packageUnit: null },
      [carrefourChicken, lidlChicken],
    );
    expect(r.state).toBe("UNRESOLVED");
    expect(r.productId).toBeNull();
  });

  it("packaging separates near-identical names", () => {
    const small = candidate({ id: "s", name: "Riz basmati", brand: "Taureau Ailé", packageQuantity: 500, packageUnit: "g" });
    const big = candidate({ id: "b", name: "Riz basmati", brand: "Taureau Ailé", packageQuantity: 2000, packageUnit: "g" });
    const r = resolveProduct(
      { name: "Riz basmati", brand: "Taureau Ailé", barcode: null, retailerId: null, retailerProductId: null, packageQuantity: 2000, packageUnit: "g" },
      [small, big],
    );
    expect(r.state).toBe("PROBABLE");
    expect(r.productId).toBe("b");
  });
});
