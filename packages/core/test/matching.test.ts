import { describe, expect, it } from "vitest";
import { normalizeName, similarity } from "../src/matching/normalize";
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
