/**
 * Outbound HTTP for external integrations: identifying User-Agent, timeouts,
 * single retry on transient failures, hard backoff semantics (ADR-0005).
 * Every external call in the app goes through here, through the SSRF guard:
 * host allowlist, http(s)-only, private-IP DNS rejection and manually
 * followed redirects that re-validate every hop.
 */

import { lookup as dnsLookup } from "node:dns/promises";

export class IntegrationError extends Error {
  constructor(
    readonly source: string,
    readonly kind: "network" | "status" | "parse" | "timeout" | "blocked",
    readonly detail: string,
  ) {
    super(`${source}: ${kind} — ${detail}`);
    this.name = "IntegrationError";
  }
}

export const APP_USER_AGENT = `Maqrivo/0.1 (+https://maqrivo.local; contact via OFF_USER_AGENT_EMAIL)`;

// ── SSRF guard ──────────────────────────────────────────────────────────────
// Every outbound call is validated before a socket is opened: http(s) URL on
// an allowlisted host, DNS-resolved against private ranges, and redirects
// followed manually so each hop re-passes the same checks (≤ 3 hops).

/**
 * Exact outbound hosts observed in the integration adapters (verified public
 * endpoints only, ADR-0005). Explicit names over wildcards; `*.ipaper.io` is
 * the single wildcard because iPaper serves leaflet assets from both cdn.
 * and files.cdn. subdomains.
 */
const ALLOWED_HOST_RULES: readonly string[] = [
  "overpass-api.de", // OSM store discovery (stores/discovery.ts)
  "photon.komoot.io", // geocoding proxy (osm/photon.ts)
  "world.openfoodfacts.org", // product reads (openfoodfacts.ts)
  "prices.openfoodfacts.org", // Open Prices reads (openprices.ts)
  "www.supermarche.com", // store directory (supermarche.ts)
  "www.auchan.fr", // catalogue list + detail HTML (auchan.ts)
  "cdn.auchan.fr", // catalogue page images (auchan payload)
  "www.carrefour.fr", // drive eligibility (carrefour.ts)
  "www.g20-minute.com", // promotions HTML (g20.ts)
  "api-prod-intermarche.e-catalogues.pro", // catalogue JSON (intermarche.ts)
  "medias-prod-intermarche.e-catalogues.pro", // page images (payload)
  "endpoints.leaflets.schwarz", // Lidl flyer overview + JSON (lidl.ts)
  "imgproxy.leaflets.schwarz", // Lidl page images (payload)
  "api.rcdss.monoprix.fr", // promotions JSON (monoprix.ts)
  "public.aldigroup-prod.magnolia-platform.com", // Aldi delivery JSON
  "catalogues.aldi.fr", // Aldi viewer HTML (detail payload link)
  "*.ipaper.io", // Aldi leaflet page images (viewer payload aws.url)
];

/** Exact rules match the host itself; `*.suffix` rules match any depth below. */
export function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOST_RULES.some((rule) =>
    rule.startsWith("*.") ? host.endsWith(rule.slice(1)) : host === rule,
  );
}

/**
 * True for addresses that must never be dialed: this-network, loopback,
 * RFC 1918 private, link-local, multicast/reserved, IPv6 loopback/ULA/
 * link-local, and IPv4-mapped IPv6 carrying any of the forbidden v4 ranges.
 */
export function isForbiddenIp(address: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return false; // malformed — not DNS output
    const [a, b] = octets as [number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  return mapped ? isForbiddenIp(mapped[1]!) : false;
}

const MAX_REDIRECT_HOPS = 3;

/** Absolute redirect target, or null when the response is final. */
export function redirectTarget(status: number, location: string | null, baseUrl: string): string | null {
  // Follow only the statuses defined to carry a Location.
  const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  if (!isRedirect || !location) return null;
  try {
    return new URL(location, baseUrl).href;
  } catch {
    return null; // a broken Location surfaces as the status error
  }
}

/** Per-host DNS verdicts for the process lifetime — integration hosts are stable. */
const dnsVerdicts = new Map<string, boolean>();

async function hostDialable(hostname: string): Promise<boolean> {
  const cached = dnsVerdicts.get(hostname);
  if (cached != null) return cached;
  // Raw rejection on purpose: lookup failures keep the retry/backoff path.
  const records = await dnsLookup(hostname, { all: true });
  const dialable = records.every((record) => !isForbiddenIp(record.address));
  dnsVerdicts.set(hostname, dialable);
  return dialable;
}

/**
 * The single fetch every helper goes through. Rejects non-http(s) URLs,
 * non-allowlisted hosts and hosts resolving into forbidden ranges; follows
 * redirects manually so every hop re-passes the same checks, at most
 * MAX_REDIRECT_HOPS of them, else fails with 'redirect-blocked'.
 */
async function guardedFetch(
  url: string,
  source: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
): Promise<Response> {
  let current = url;
  for (let hop = 0; ; hop++) {
    const blocked = (detail: string) =>
      new IntegrationError(source, "blocked", hop === 0 ? detail : `redirect-blocked: ${detail}`);
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw blocked(`unparseable URL '${current.slice(0, 200)}'`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw blocked(`protocol '${parsed.protocol}' is not http(s)`);
    }
    if (!hostAllowed(parsed.hostname)) {
      throw blocked(`host '${parsed.hostname}' is not on the outbound allowlist`);
    }
    if (!(await hostDialable(parsed.hostname))) {
      throw blocked(`host '${parsed.hostname}' resolves inside a forbidden range`);
    }
    const res = await fetch(parsed.href, { ...init, redirect: "manual" });
    const next = redirectTarget(res.status, res.headers.get("location"), parsed.href);
    if (!next) return res;
    if (hop >= MAX_REDIRECT_HOPS) {
      throw blocked(`more than ${MAX_REDIRECT_HOPS} redirect hops from '${url.slice(0, 200)}'`);
    }
    current = next;
  }
}

interface PoliteFetchOptions {
  source: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  accept?: string;
}

export async function politeFetchJson<T>(
  url: string,
  options: PoliteFetchOptions,
): Promise<T> {
  const { source, timeoutMs = 15_000, headers = {}, accept = "application/json" } = options;

  let lastError: IntegrationError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await guardedFetch(url, source, {
        signal: controller.signal,
        headers: { "User-Agent": APP_USER_AGENT, accept, ...headers },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastError = new IntegrationError(source, "status", `HTTP ${res.status}`);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new IntegrationError(source, "status", `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof IntegrationError) throw err;
      if (attempt === 1) {
        throw new IntegrationError(
          source,
          err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
          err instanceof Error ? err.message : String(err),
        );
      }
      lastError = null;
    }
  }
  throw lastError ?? new IntegrationError(source, "network", "unreachable");
}

/**
 * Polite text fetch for official server-rendered integration pages. The same
 * timeout, retry, identifying-UA and hard-stop rules as JSON integrations
 * apply; callers parse the returned HTML as data and never execute it.
 */
export async function politeFetchText(
  url: string,
  options: PoliteFetchOptions,
): Promise<string> {
  const { source, timeoutMs = 15_000, headers = {}, accept = "text/html" } = options;

  let lastError: IntegrationError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await guardedFetch(url, source, {
        signal: controller.signal,
        headers: { "User-Agent": APP_USER_AGENT, accept, ...headers },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastError = new IntegrationError(source, "status", `HTTP ${res.status}`);
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new IntegrationError(source, "status", `HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof IntegrationError) throw err;
      if (attempt === 1) {
        throw new IntegrationError(
          source,
          err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
          err instanceof Error ? err.message : String(err),
        );
      }
      lastError = null;
    }
  }
  throw lastError ?? new IntegrationError(source, "network", "unreachable");
}

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // mirrors the upload cap

/**
 * Polite binary fetch for remote leaflet images: same retry/backoff
 * semantics as politeFetchJson, MIME-validated and size-capped before
 * anything reaches the storage volume.
 */
export async function politeFetchImage(
  url: string,
  options: PoliteFetchOptions,
): Promise<{ mime: string; bytes: Uint8Array }> {
  const { source, timeoutMs = 20_000, headers = {} } = options;

  let lastError: IntegrationError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await guardedFetch(url, source, {
        signal: controller.signal,
        // JPEG-first content negotiation: CDNs that serve AVIF/WebP on a
        // permissive Accept would hand the vision pipeline a format the
        // image model rejects (observed: iPaper CDN -> webp -> Z.AI 400).
        headers: {
          "User-Agent": APP_USER_AGENT,
          accept: "image/jpeg,image/png;q=0.9,image/*;q=0.5",
          ...headers,
        },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastError = new IntegrationError(source, "status", `HTTP ${res.status}`);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new IntegrationError(source, "status", `HTTP ${res.status}`);
      }
      const mime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        throw new IntegrationError(source, "parse", `content-type '${mime}' is not an allowed image type`);
      }
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > MAX_IMAGE_BYTES) {
        throw new IntegrationError(source, "parse", `image exceeds 8 MB (${declared} bytes)`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new IntegrationError(source, "parse", "empty or larger than 8 MB");
      }
      return { mime, bytes };
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof IntegrationError) throw err;
      if (attempt === 1) {
        throw new IntegrationError(
          source,
          err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
          err instanceof Error ? err.message : String(err),
        );
      }
      lastError = null;
    }
  }
  throw lastError ?? new IntegrationError(source, "network", "unreachable");
}
