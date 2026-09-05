import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  intermarcheCatalogueMeta,
  intermarcheItemsFromPages,
  intermarchePageImageUrls,
} from "../src/server/integrations/retailers/intermarche";
import { lidlCatalogueFromFlyer, lidlNationalFlyers } from "../src/server/integrations/retailers/lidl";
import {
  auchanCatalogueFromHtml,
  auchanCatalogueRefsFromHtml,
  auchanOfferPrices,
} from "../src/server/integrations/retailers/auchan";
import { g20CatalogueFromHtml } from "../src/server/integrations/retailers/g20";
import { monoprixCataloguesFromPayloads } from "../src/server/integrations/retailers/monoprix";

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8"));
}

function textFixture(path: string): string {
  return readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
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

describe("G20 promotions HTML to catalogue (fixture)", () => {
  const catalogue = g20CatalogueFromHtml(textFixture("g20/promotions.html"));

  it("maps EAN cards and integer-cent basket prices", () => {
    expect(catalogue.items).toHaveLength(2);
    expect(catalogue.items[0]).toMatchObject({
      ean: "5053990156009",
      priceCents: 134,
      regularPriceCents: 179,
      pricePerKgCents: 1023,
      packaging: "175g",
      loyalty: true,
      mechanism: "SECOND_UNIT_DISCOUNT",
      minQty: 2,
      discountPct: 50,
    });
    expect(catalogue.sourceUrl).toContain("g20-minute.com/taxons/promotions");
  });
});

describe("Auchan SSR catalogue HTML (fixtures)", () => {
  const refs = auchanCatalogueRefsFromHtml(textFixture("auchan/catalogues.html"));

  it("prioritizes current grocery catalogues and maps Paris-local dates", () => {
    expect(refs[0]).toMatchObject({
      externalId: "food-AbCd",
      title: "Les promos du moment",
      validFrom: "2026-09-01",
      validUntil: "2026-09-13",
    });
    expect(refs.at(-1)?.title).toBe("Electroshow");
  });

  it("normalizes multibuy prices and skips per-kg-only zones", () => {
    const catalogue = auchanCatalogueFromHtml(refs[0]!, textFixture("auchan/catalogue-detail.html"));
    expect(catalogue.pageImageUrls).toHaveLength(2);
    expect(catalogue.items).toHaveLength(3);
    expect(catalogue.items[0]).toMatchObject({
      priceCents: 237,
      regularPriceCents: 279,
      pricePerKgCents: 790,
      page: 1,
    });
    expect(catalogue.items[1]).toMatchObject({ priceCents: 112, regularPriceCents: 168 });
    expect(catalogue.items[2]).toMatchObject({ priceCents: 1599, regularPriceCents: 1776, page: 2 });
  });

  it("does not present a per-kg amount as a pack price", () => {
    expect(auchanOfferPrices("JAMBON", "315 g Soit le kg : 12€95")).toMatchObject({
      priceCents: null,
      regularPriceCents: null,
      pricePerKgCents: 1295,
    });
  });
});

describe("Monoprix official JSON to catalogues (fixture)", () => {
  const catalogues = monoprixCataloguesFromPayloads([fixture("monoprix/promotions.json")]);

  it("groups campaign items with EAN, dates and effective promo prices", () => {
    expect(catalogues).toHaveLength(1);
    expect(catalogues[0]).toMatchObject({
      validFrom: "2026-08-25",
      validUntil: "2026-09-06",
    });
    expect(catalogues[0]!.items[0]).toMatchObject({
      ean: "8076809523509",
      priceCents: 112,
      regularPriceCents: 159,
      pricePerKgCents: 223,
      brand: "BARILLA",
      loyalty: false,
    });
    expect(catalogues[0]!.items[1]).toMatchObject({
      pricePerKgCents: 250,
      loyalty: true,
    });
  });
});
