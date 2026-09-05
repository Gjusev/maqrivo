import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  intermarcheCatalogueMeta,
  intermarcheItemsFromPages,
  intermarchePageImageUrls,
} from "../src/server/integrations/retailers/intermarche";
import { lidlCatalogueFromFlyer, lidlNationalFlyers } from "../src/server/integrations/retailers/lidl";

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8"));
}

describe("Intermarché pages → items (fixture)", () => {
  const items = intermarcheItemsFromPages(fixture("intermarche/catalog-pages.json"));

  it("extracts zones with prices", () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.priceCents).not.toBeNull();
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.label).not.toMatch(/\n/); // collapsed to one line
    }
  });

  it("converts euros to cents exactly", () => {
    const steaks = items.find((i) => i.ean === "3181238945817");
    expect(steaks).toBeDefined();
    expect(steaks!.priceCents).toBe(1089); // 10.89 €
    expect(steaks!.pricePerKgCents).toBe(1815); // 18.15 €/kg
    expect(steaks!.regularPriceCents).toBeNull(); // oldPrice 0 → no crossed price
    expect(steaks!.loyalty).toBe(false);
    expect(steaks!.validityText).toContain("08/09/2026");
  });

  it("drops zones without a product or price", () => {
    expect(items.every((i) => i.priceCents != null && i.label)).toBe(true);
  });

  it("page image URLs are indexed by page number", () => {
    const urls = intermarchePageImageUrls(fixture("intermarche/catalog-pages.json"));
    // Fixture keeps pages 9-11 (the ones with product zones): position 8 = page 9.
    const firstUrl = urls.find((u) => u !== "");
    expect(firstUrl).toMatch(/^https:\/\/medias-prod-intermarche\.e-catalogues\.pro\//);
    expect(urls[8]).toBe(firstUrl);
  });
});

describe("Intermarché catalogue metadata (fixtures)", () => {
  it("maps designation, dates and numeric id", () => {
    const meta = intermarcheCatalogueMeta(fixture("intermarche/catalog-detail.json"));
    expect(meta.externalId).toBe("2755708092026-984puRgB");
    expect(meta.catalogId).toBe(138969);
    expect(meta.validFrom).toBe("2026-09-08");
    expect(meta.validUntil).toBe("2026-09-20");
    expect(meta.title).toContain("anniversaire");
  });
});

describe("Lidl overview → national flyers (fixture)", () => {
  it("keeps only national-region flyers with their fetch URL", () => {
    const refs = lidlNationalFlyers(fixture("lidl/overview.json"));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.flyerJsonUrl).toContain("endpoints.leaflets.schwarz");
    expect(refs[0]!.externalId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Lidl flyer → catalogue (fixture)", () => {
  const catalogue = lidlCatalogueFromFlyer(fixture("lidl/flyer-week.json"));

  it("maps products to items with cents and no EAN", () => {
    expect(catalogue.items.length).toBeGreaterThan(0);
    for (const item of catalogue.items) {
      expect(item.priceCents).not.toBeNull();
      expect(item.ean).toBeNull(); // Lidl payloads carry no barcode
      expect(item.loyalty).toBe(false);
    }
  });

  it("parses dot-decimal price strings exactly", () => {
    const matelas = catalogue.items.find((i) => i.label.includes("Matelas"));
    expect(matelas).toBeDefined();
    expect(matelas!.priceCents).toBe(2499); // "24.99"
    expect(matelas!.brand).toBe("LIVARNO®");
  });

  it("carries validity dates and page images", () => {
    expect(catalogue.validFrom).toBe("2026-08-27");
    expect(catalogue.validUntil).toBe("2026-09-09");
    expect(catalogue.pageImageUrls.length).toBeGreaterThan(0);
  });
});
