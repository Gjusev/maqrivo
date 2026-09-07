import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  aldiCatalogueFromViewer,
  aldiLeafletRefs,
  aldiViewerConfigFromHtml,
  aldiViewerRefFromDetail,
} from "../src/server/integrations/retailers/aldi";
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

describe("Aldi Magnolia + iPaper vision pipeline (fixtures)", () => {
  const refs = aldiLeafletRefs(fixture("aldi/leaflets.json"));
  const viewer = aldiViewerRefFromDetail(fixture("aldi/detail.json"));
  const catalogue = aldiCatalogueFromViewer(viewer, textFixture("aldi/viewer.html"));

  it("finds every tile across the leaflets area groups", () => {
    expect(refs).toHaveLength(3);
    expect(refs[1]).toMatchObject({
      title: "Catalogue de cette semaine",
      coverUrl: "https://s7g10.scene7.com/is/image/aldinord/Catalogue-Neutre-46",
      referencePath: "/catalogue/cette-semaine",
    });
  });

  it("resolves the public viewer link and its slug as externalId", () => {
    expect(viewer).toMatchObject({
      externalId: "kw372026",
      title: "Catalogue de cette semaine",
      viewerUrl: "https://catalogues.aldi.fr/kw372026/",
    });
  });

  it("builds signed page image URLs with the paper uuid and token", () => {
    expect(catalogue.pageImageUrls[0]).toBe(
      "https://cdn.ipaper.io/iPaper/Papers/1e2d3b4a-5f6e-4a7b-8c9d-0a1b2c3d4e5f/Pages/1/Zoom.jpg" +
        "?token=FAKEtoken_0000AAAA1111BBBB2222CCCC3333DDDD" +
        "&token_path=%2fiPaper%2fPapers%2f1e2d3b4a-5f6e-4a7b-8c9d-0a1b2c3d4e5f%2fPages%2f" +
        "&expires=1788873621",
    );
    expect(catalogue.items).toEqual([]); // vision mode
    expect(catalogue.sourceUrl).toBe("https://catalogues.aldi.fr/kw372026/");
  });

  it("unescapes the literal \\u0026 into & in the policy", () => {
    for (const url of catalogue.pageImageUrls) {
      expect(url).not.toContain("\\u0026");
      expect(url).toContain("&token_path=");
      expect(url).toContain("&expires=");
    }
  });

  it("returns null dates when the viewer config carries none", () => {
    expect(catalogue.validFrom).toBeNull();
    expect(catalogue.validUntil).toBeNull();
  });

  it("ISO-ifies dates when the config carries them", () => {
    const dated = aldiViewerConfigFromHtml(
      '"aws":{"url":"https://cdn.ipaper.io/iPaper/Papers/uu/","policy":"token=t\\u0026expires=1"},"pages":[1],' +
        '"config":{"ValidFrom":"2026-09-02T00:00:00Z","ValidUntil":"2026-09-08 23:59:59"},' +
        '"fallback":{"StartDate":"09/09/2026"}',
    );
    expect(dated.validFrom).toBe("2026-09-02");
    expect(dated.validUntil).toBe("2026-09-08");
  });

  it("builds every page without capping (12-page cap belongs to the sync layer)", () => {
    expect(catalogue.pageImageUrls).toHaveLength(45);
    expect(catalogue.pageImageUrls.at(-1)).toContain("/Pages/45/Zoom.jpg");
  });
});

describe("Aldi wiring drift guards", () => {
  it("registers the aldi adapter in adapters.ts", () => {
    const registry = readFileSync(
      new URL("../src/server/integrations/retailers/adapters.ts", import.meta.url),
      "utf8",
    );
    expect(registry).toMatch(/import "\.\/aldi";/);
  });

  it("seeds the aldi retailer with its adapter", () => {
    const seed = readFileSync(
      new URL("../../../packages/db/src/seed/retailers.ts", import.meta.url),
      "utf8",
    );
    expect(seed).toMatch(/slug: "aldi", name: "Aldi", kind: "chain", adapter: "aldi"/);
  });
});
