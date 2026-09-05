/**
 * Intermarché adapter — Aristid/e-catalogues flipbook platform. The API key
 * below is the static public key shipped in the viewer JS bundle served to
 * every visitor of the official leaflet site (discovered and live-verified
 * 2026-09-05, fixtures/intermarche/; same trust class as the Carrefour
 * eligibility endpoint — public-by-design, not an auth bypass). Payloads
 * carry STRUCTURED prices and EAN per deal zone: promotions land without
 * any AI step. v1 ingests national campaigns only; per-store local
 * catalogues (/catalogs?codeStore={pdv}) are a follow-up once stores
 * carry their PDV code.
 */
import { z } from "zod";
import { politeFetchJson } from "../http";
import { registerFlipbook, type RemoteCatalogue, type RemoteCatalogueItem } from "./flipbook";

const API_BASE = "https://api-prod-intermarche.e-catalogues.pro/api";
const VIEWER_ORIGIN = "https://layout-prod-intermarche.e-catalogues.pro";

/** Public viewer headers the API's nginx expects (verified live). */
const HEADERS: Record<string, string> = {
  "X-API-Key": "e76fff28-1fcb-4461-affb-8de00d7d542f",
  Origin: VIEWER_ORIGIN,
  Referer: `${VIEWER_ORIGIN}/`,
};

const SOURCE = "intermarche";

// ── Payload schemas (mirror fixtures/intermarche/) ─────────────────────────

const campaignSchema = z.object({
  designation: z.string(),
  label: z.string().nullish(),
  name: z.string().nullish(),
  startCampaignDate: z.string().nullish(),
  endCampaignDate: z.string().nullish(),
});

/** List items omit the numeric catalogue id — the detail call resolves it. */
const catalogsListItemSchema = z.object({
  campaign: campaignSchema,
  catalog: z.object({ id: z.number().nullish() }).loose(),
});

const catalogDetailSchema = z.object({
  campaign: campaignSchema,
  catalog: z.object({ id: z.number() }),
});

const productZoneSchema = z.object({
  ean: z.union([z.string(), z.number()]).nullish(),
  label: z.string().nullish(),
  brand: z.string().nullish(),
  price: z.number().nullish(),
  oldPrice: z.number().nullish(),
  offerPrice: z.number().nullish(),
  unitVolumePrice: z.number().nullish(),
  packaging: z.string().nullish(),
  category: z.string().nullish(),
  subCategory: z.string().nullish(),
  description3: z.string().nullish(),
});

const catalogPagesSchema = z.array(
  z.object({
    pageNumber: z.number().nullish(),
    jpgUrl: z.string().nullish(),
    zones: z
      .array(z.object({ product: productZoneSchema.nullish() }))
      .nullish(),
  }),
);

// ── Pure mapping (fixture-tested) ──────────────────────────────────────────

const isoDate = (value: string | null | undefined): string | null =>
  value ? value.slice(0, 10) : null;

const cents = (euros: number | null | undefined): number | null =>
  euros != null && euros > 0 ? Math.round(euros * 100) : null;

const cleanEan = (ean: string | number | null | undefined): string | null => {
  if (ean == null) return null;
  const digits = String(ean).trim();
  return /^\d{6,14}$/.test(digits) ? digits : null;
};

/** Collapse the ALL-CAPS multi-line leaflet labels into one clean line. */
const cleanLabel = (label: string | null | undefined): string =>
  (label ?? "").replace(/\s+/g, " ").trim();

/** Page image URLs indexed by page number (position pageNumber - 1). */
export function intermarchePageImageUrls(payload: unknown): string[] {
  const pages = catalogPagesSchema.parse(payload);
  const urls: string[] = [];
  for (const page of pages) {
    if (page.pageNumber != null && page.jpgUrl) {
      urls[page.pageNumber - 1] = page.jpgUrl;
    }
  }
  return Array.from(urls, (url) => url ?? "");
}

export function intermarcheItemsFromPages(payload: unknown): RemoteCatalogueItem[] {
  const pages = catalogPagesSchema.parse(payload);
  const items: RemoteCatalogueItem[] = [];
  for (const page of pages) {
    for (const zone of page.zones ?? []) {
      const p = zone.product;
      if (!p || !p.label) continue;
      const label = cleanLabel(p.label);
      if (!label) continue;
      const promoCents = cents(p.offerPrice) ?? cents(p.price);
      if (promoCents == null) continue; // a deal without any price is not a deal
      items.push({
        ean: cleanEan(p.ean),
        label,
        brand: p.brand ? cleanLabel(p.brand) : null,
        priceCents: promoCents,
        regularPriceCents:
          cents(p.oldPrice) ?? (p.offerPrice != null && p.offerPrice > 0 ? cents(p.price) : null),
        pricePerKgCents: cents(p.unitVolumePrice),
        packaging: p.packaging ?? null,
        category: p.subCategory ?? p.category ?? null,
        loyalty: p.offerPrice != null && p.offerPrice > 0,
        validityText: p.description3 ? cleanLabel(p.description3) : null,
        page: page.pageNumber ?? null,
      });
    }
  }
  return items;
}

export function intermarcheCatalogueMeta(payload: unknown): {
  externalId: string;
  title: string | null;
  validFrom: string | null;
  validUntil: string | null;
  catalogId: number | null;
} {
  const parsed = catalogDetailSchema.parse(payload);
  return {
    externalId: parsed.campaign.designation,
    title: parsed.campaign.label ?? parsed.campaign.name ?? null,
    validFrom: isoDate(parsed.campaign.startCampaignDate),
    validUntil: isoDate(parsed.campaign.endCampaignDate),
    catalogId: parsed.catalog.id,
  };
}

// ── Fetchers + registration ────────────────────────────────────────────────

/** Politeness cap per run (ADR-0005). */
const MAX_CATALOGUES = 3;

async function fetchNationalCatalogues(): Promise<RemoteCatalogue[]> {
  const list = await politeFetchJson<unknown>(`${API_BASE}/catalogs/allV1AndNotLocal`, {
    source: SOURCE,
    headers: HEADERS,
  });
  const result: RemoteCatalogue[] = [];
  for (const entry of z.array(z.unknown()).parse(list).slice(0, MAX_CATALOGUES)) {
    // The list endpoint omits the numeric catalogue id — one detail call resolves it.
    const designation = catalogsListItemSchema.parse(entry).campaign.designation;
    const detail = await politeFetchJson<unknown>(`${API_BASE}/catalogs/${designation}`, {
      source: SOURCE,
      headers: HEADERS,
    });
    const meta = intermarcheCatalogueMeta(detail);
    if (!meta.catalogId) continue;
    const pages = await politeFetchJson<unknown>(`${API_BASE}/catalogs/${meta.catalogId}/pages`, {
      source: SOURCE,
      headers: HEADERS,
    });
    result.push({
      externalId: meta.externalId,
      title: meta.title,
      validFrom: meta.validFrom,
      validUntil: meta.validUntil,
      sourceUrl: `${API_BASE}/catalogs/${encodeURIComponent(meta.externalId)}`,
      pageImageUrls: intermarchePageImageUrls(pages),
      items: intermarcheItemsFromPages(pages),
    });
  }
  return result;
}

registerFlipbook("intermarche", { source: fetchNationalCatalogues, storeKeyed: false });
