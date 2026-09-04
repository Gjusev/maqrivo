import { describe, expect, it } from "vitest";
import { normalizeOffProduct, offProductSchema, parseOffQuantity } from "../src/server/integrations/openfoodfacts";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/openfoodfacts/nutella-v3.json", import.meta.url), "utf-8"),
);

describe("OFF quantity parsing", () => {
  it("parses simple grams", () => {
    expect(parseOffQuantity("600 g")).toEqual({ quantity: 600, unit: "g" });
  });

  it("parses french decimal comma litres", () => {
    expect(parseOffQuantity("1,5 L")).toEqual({ quantity: 1500, unit: "ml" });
  });

  it("parses multipacks into totals", () => {
    expect(parseOffQuantity("6 x 125 g")).toEqual({ quantity: 750, unit: "g" });
  });

  it("parses kilograms to grams", () => {
    expect(parseOffQuantity("1 kg")).toEqual({ quantity: 1000, unit: "g" });
  });

  it("parses centilitres", () => {
    expect(parseOffQuantity("33 cl")).toEqual({ quantity: 330, unit: "ml" });
  });

  it("falls back to unit counts", () => {
    expect(parseOffQuantity("6 œufs")).toEqual({ quantity: 6, unit: "unit" });
  });

  it("returns null on garbage", () => {
    expect(parseOffQuantity("quelque chose")).toBeNull();
    expect(parseOffQuantity(undefined)).toBeNull();
  });
});

describe("OFF product normalization (fixture)", () => {
  it("maps a real v3 payload to our product shape", () => {
    const parsed = offProductSchema.safeParse(fixture.product);
    expect(parsed.success).toBe(true);
    const normalized = normalizeOffProduct({ ...parsed.data!, code: parsed.data!.code ?? fixture.code });

    expect(normalized?.barcode).toBe("3017620422003");
    expect(normalized?.name.toLowerCase()).toContain("nutella");
    // Nutella's quantity field is empty on OFF: package stays honestly null.
    expect(normalized?.packageQuantity).toBeNull();
    expect(normalized?.purchasingMode).toBe("PACKAGED");
    expect(normalized?.nutrition?.energyKcal).toBe(539);
    expect(normalized?.nutrition?.proteinG).toBeCloseTo(6.3);
    expect(normalized?.nutrition?.basis).toBe("100g");
  });

  it("treats labels as claims, not halal proof", () => {
    const withHalalLabel = {
      code: "123",
      product_name: "Test",
      labels_tags: ["en:halal"],
    };
    const normalized = normalizeOffProduct(withHalalLabel);
    expect(normalized?.halalClaimed).toBe(true);
  });

  it("refuses products without name or barcode", () => {
    expect(normalizeOffProduct({ code: "1" })).toBeNull();
    expect(normalizeOffProduct({ product_name: "x" })).toBeNull();
  });

  it("keeps unknown nutrition as null, never zero", () => {
    const normalized = normalizeOffProduct({ code: "42", product_name: "Mystery" });
    expect(normalized?.nutrition).toBeNull();
  });
});
