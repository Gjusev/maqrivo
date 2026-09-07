/**
 * Aldi France adapter — vision mode over the official iPaper viewer.
 *
 * Chain (tech-lead verified live, all public endpoints, ADR-0005):
 * 1. Magnolia delivery REST lists the current leaflets: the "leaflets" area
 *    of /france/catalogue holds numbered children whose tiles0/tiles1/…
 *    carry title, description, cover image and a reference path.
 * 2. Each reference path resolves to a page whose "link" field is the
 *    public iPaper viewer (catalogues.aldi.fr/<kw-slug>/).
 * 3. The viewer HTML embeds its config INLINE (window.dataStore): the aws
 *    object (CDN base + signed policy, with ampersands escaped as the
 *    literal six characters \u0026) and the pages array.
 * 4. Page images are <aws.url>Pages/<n>/Zoom.jpg?<policy> — returned as
 *    URLs only; the sync caller downloads them (12-page cap lives there).
 *
 * The signed policy is parsed from every viewer page at sync time and is
 * never hardcoded. Dates come from the viewer config when it carries them;
 * null otherwise — never invented.
 */
import { z } from "zod";
import { IntegrationError, politeFetchJson, politeFetchText } from "../http";
import { registerFlipbook, type RemoteCatalogue } from "./flipbook";

const SOURCE = "aldi";
const DELIVERY_BASE =
  "https://public.aldigroup-prod.magnolia-platform.com/.rest/delivery/pages/france";
const LIST_PATH = "/catalogue";

// ── Step 1: leaflet list (Magnolia delivery JSON) ───────────────────────────

const tileSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  tileImage: z.string().nullish(),
  reference: z.object({ path: z.string() }).nullish(),
});

const cataloguePageSchema = z.object({
  leaflets: z.record(z.string(), z.unknown()).nullish(),
});

const leafletGroupSchema = z.object({
  tiles: z.record(z.string(), z.unknown()).nullish(),
});

export interface AldiLeafletRef {
  readonly title: string | null;
  readonly description: string | null;
  readonly coverUrl: string | null;
  /** Detail-page path to append to the delivery base, e.g. /catalogue/cette-semaine. */
  readonly referencePath: string;
}

/** Numbered children × tilesN tiles of the "leaflets" area, in payload order. */
export function aldiLeafletRefs(payload: unknown): AldiLeafletRef[] {
  const { leaflets } = cataloguePageSchema.parse(payload);
  const refs: AldiLeafletRef[] = [];
  for (const [childKey, group] of Object.entries(leaflets ?? {})) {
    if (!/^\d+$/.test(childKey)) continue; // @-metadata / mgnl:* bookkeeping
    const { tiles } = leafletGroupSchema.parse(group);
    for (const [tileKey, tile] of Object.entries(tiles ?? {})) {
      if (!/^tiles\d*$/.test(tileKey)) continue;
      const parsed = tileSchema.parse(tile);
      const path = parsed.reference?.path;
      if (!path) continue; // cover-only tile, nothing to ingest
      refs.push({
        title: parsed.title ?? null,
        description: parsed.description ?? null,
        coverUrl: parsed.tileImage ?? null,
        referencePath: path,
      });
    }
  }
  return refs;
}

// ── Step 2: leaflet detail → public iPaper viewer ───────────────────────────

const detailSchema = z.object({
  link: z.string(),
  productDetailsHeadline: z.string().nullish(),
  overviewHeadline: z.string().nullish(),
});

export interface AldiViewerRef {
  /** Viewer path slug, e.g. "kw372026" — retailer-stable catalogue id. */
  readonly externalId: string;
  readonly title: string | null;
  readonly viewerUrl: string;
}

export function aldiViewerRefFromDetail(payload: unknown): AldiViewerRef {
  const detail = detailSchema.parse(payload);
  let slug: string | undefined;
  try {
    slug = new URL(detail.link).pathname.split("/").filter(Boolean).at(-1);
  } catch {
    slug = undefined;
  }
  if (!slug) {
    throw new IntegrationError(SOURCE, "parse", `viewer link without path slug: ${detail.link}`);
  }
  return {
    externalId: slug,
    title: detail.productDetailsHeadline?.trim() || detail.overviewHeadline?.trim() || null,
    viewerUrl: detail.link,
  };
}

// ── Step 3: inline viewer config (window.dataStore) ─────────────────────────

/** Raw HTML escapes JSON ampersands as the literal six characters \u0026. */
const ESCAPED_AMPERSAND = /\\u0026/g;
const AWS_OBJECT = /"aws"\s*:\s*\{([^}]*)\}/;
const PAGES_ARRAY = /"pages"\s*:\s*\[([^\]]*)\]/;
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;

const stringField = (block: string, name: string): string | null =>
  new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`).exec(block)?.[1] ?? null;

/**
 * First ISO date (YYYY-MM-DD) behind any of the candidate keys,
 * case-insensitive; null when the config carries none. Never invents dates.
 */
function isoDateFromConfig(html: string, keys: readonly string[]): string | null {
  for (const key of keys) {
    const raw = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, "i").exec(html)?.[1];
    const iso = raw && ISO_DATE.exec(raw)?.[0];
    if (iso) return iso;
  }
  return null;
}

export interface AldiViewerConfig {
  /** aws.url CDN base with trailing slash, e.g. https://cdn.ipaper.io/iPaper/Papers/<uuid>/. */
  readonly cdnUrl: string;
  /** Signed query string, \u0026 unescaped to &. */
  readonly policy: string;
  readonly pages: readonly number[];
  readonly validFrom: string | null;
  readonly validUntil: string | null;
}

export function aldiViewerConfigFromHtml(html: string): AldiViewerConfig {
  const aws = AWS_OBJECT.exec(html)?.[1];
  const cdnUrl = aws && stringField(aws, "url");
  const policy = aws && stringField(aws, "policy");
  if (!cdnUrl || !policy) {
    throw new IntegrationError(SOURCE, "parse", "viewer HTML without aws url/policy");
  }
  const pages = (PAGES_ARRAY.exec(html)?.[1] ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((page) => Number.isSafeInteger(page) && page > 0);
  if (pages.length === 0) {
    throw new IntegrationError(SOURCE, "parse", "viewer HTML without pages array");
  }
  return {
    cdnUrl: cdnUrl.endsWith("/") ? cdnUrl : `${cdnUrl}/`,
    policy: policy.replace(ESCAPED_AMPERSAND, "&"),
    pages,
    validFrom: isoDateFromConfig(html, ["ValidFrom", "StartDate", "FromDate"]),
    validUntil: isoDateFromConfig(html, ["ValidUntil", "EndDate", "ToDate"]),
  };
}

// ── Steps 3–5: catalogue assembly (vision mode) ─────────────────────────────

export function aldiCatalogueFromViewer(viewer: AldiViewerRef, html: string): RemoteCatalogue {
  const config = aldiViewerConfigFromHtml(html);
  return {
    externalId: viewer.externalId,
    title: viewer.title,
    validFrom: config.validFrom,
    validUntil: config.validUntil,
    sourceUrl: viewer.viewerUrl,
    pageImageUrls: config.pages.map(
      (page) => `${config.cdnUrl}Pages/${page}/Zoom.jpg?${config.policy}`,
    ),
    items: [], // vision mode: deals come from the user-confirmed page pipeline
  };
}

// ── Fetchers + registration ─────────────────────────────────────────────────

async function fetchAldiCatalogues(): Promise<RemoteCatalogue[]> {
  const list = await politeFetchJson<unknown>(`${DELIVERY_BASE}${LIST_PATH}`, { source: SOURCE });
  const catalogues: RemoteCatalogue[] = [];
  for (const ref of aldiLeafletRefs(list)) {
    const detailUrl = /^https?:\/\//.test(ref.referencePath)
      ? ref.referencePath
      : `${DELIVERY_BASE}${ref.referencePath.startsWith("/") ? "" : "/"}${ref.referencePath}`;
    const viewer = aldiViewerRefFromDetail(
      await politeFetchJson<unknown>(detailUrl, { source: SOURCE }),
    );
    const html = await politeFetchText(viewer.viewerUrl, { source: SOURCE });
    catalogues.push(aldiCatalogueFromViewer(viewer, html));
  }
  return catalogues;
}

registerFlipbook("aldi", { source: fetchAldiCatalogues, storeKeyed: false });
