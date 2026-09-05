/**
 * Lidl France adapter — Schwarz Group leaflet platform. Fully public JSON
 * (no auth, no key, CORS-open; live-verified 2026-09-05, fixtures/lidl/).
 * Prices are structured but carry no EAN — product matching falls to the
 * deterministic name/brand scorer instead of barcode EXACT. v1 ingests the
 * NATIONAL flyers only; regional variants (offer_region codes) follow once
 * the user's region is known.
 */
import { z } from "zod";
import { politeFetchJson } from "../http";
import { registerFlipbook, type RemoteCatalogue, type RemoteCatalogueItem } from "./flipbook";

const SOURCE = "lidl";
const OVERVIEW_URL = "https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/fr-FR";

// ── Payload schemas (mirror fixtures/lidl/) ─────────────────────────────────

const flyerSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  flyerJson: z.string().nullish(),
  regions: z
    .array(z.object({ type: z.string().nullish(), code: z.string().nullish() }))
    .nullish(),
});

const overviewSchema = z.object({
  categories: z
    .array(
      z.object({
        subcategories: z
          .array(z.object({ flyers: z.array(flyerSummarySchema).nullish() }))
          .nullish(),
      }),
    )
    .nullish(),
});

const flyerProductSchema = z.object({
  productId: z.string().nullish(),
  title: z.string().nullish(),
  brand: z.string().nullish(),
  price: z.string().nullish(),
  description: z.string().nullish(),
  categoryPrimary: z.string().nullish(),
});

const flyerDetailSchema = z.object({
  flyer: z.object({
    id: z.string(),
    name: z.string().nullish(),
    title: z.string().nullish(),
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
    pages: z
      .array(
        z.object({
          number: z.number().nullish(),
          image: z.string().nullish(),
        }),
      )
      .nullish(),
    products: z.record(z.string(), flyerProductSchema).nullish(),
  }),
});

// ── Pure mapping (fixture-tested) ──────────────────────────────────────────

const isoDate = (value: string | null | undefined): string | null =>
  value ? value.slice(0, 10) : null;

/** "24.99" → 2499 cents; tolerate a comma decimal like "2,49". */
const centsFromLidlPrice = (price: string | null | undefined): number | null => {
  if (!price) return null;
  const normalized = price.replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
};

export interface LidlFlyerRef {
  readonly externalId: string;
  readonly title: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly flyerJsonUrl: string;
}

export function lidlNationalFlyers(payload: unknown): LidlFlyerRef[] {
  const parsed = overviewSchema.parse(payload);
  const flyers = (parsed.categories ?? []).flatMap((c) =>
    (c.subcategories ?? []).flatMap((s) => s.flyers ?? []),
  );
  const national = flyers.filter((f) => (f.regions ?? []).some((r) => r?.type === "national"));
  return national.map((f) => ({
    externalId: f.id,
    title: f.title ?? f.name ?? null,
    validFrom: isoDate(f.startDate),
    validUntil: isoDate(f.endDate),
    flyerJsonUrl: f.flyerJson ?? `https://endpoints.leaflets.schwarz/v4/flyer?version=4&flyer_identifier=${f.id}&client=lidl`,
  }));
}

export function lidlCatalogueFromFlyer(payload: unknown): RemoteCatalogue {
  const parsed = flyerDetailSchema.parse(payload);
  const flyer = parsed.flyer;
  const products = Object.values(flyer.products ?? {});
  const items: RemoteCatalogueItem[] = [];
  for (const product of products) {
    const label = (product.title ?? "").replace(/\s+/g, " ").trim();
    const priceCents = centsFromLidlPrice(product.price);
    if (!label || priceCents == null) continue; // no price, no deal
    items.push({
      ean: null, // Lidl payloads carry no barcode
      label,
      brand: product.brand ? product.brand.replace(/\s+/g, " ").trim() || null : null,
      priceCents,
      regularPriceCents: null,
      pricePerKgCents: null,
      packaging: null,
      category: product.categoryPrimary ?? null,
      loyalty: false,
      validityText: null,
      page: null,
    });
  }
  return {
    externalId: flyer.id,
    title: flyer.title ?? flyer.name ?? null,
    validFrom: isoDate(flyer.startDate),
    validUntil: isoDate(flyer.endDate),
    pageImageUrls: (flyer.pages ?? [])
      .filter((p) => p.number != null && p.image)
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .map((p) => p.image ?? ""),
    items,
  };
}

// ── Fetchers + registration ────────────────────────────────────────────────

/** Politeness cap per run (ADR-0005). */
const MAX_FLYERS = 2;

async function fetchNationalFlyers(): Promise<RemoteCatalogue[]> {
  const overview = await politeFetchJson<unknown>(OVERVIEW_URL, { source: SOURCE });
  const result: RemoteCatalogue[] = [];
  for (const ref of lidlNationalFlyers(overview).slice(0, MAX_FLYERS)) {
    const detail = await politeFetchJson<unknown>(ref.flyerJsonUrl, { source: SOURCE });
    result.push(lidlCatalogueFromFlyer(detail));
  }
  return result;
}

registerFlipbook("lidl", { source: fetchNationalFlyers, storeKeyed: false });
