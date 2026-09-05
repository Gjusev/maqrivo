/**
 * Outbound HTTP for external integrations: identifying User-Agent, timeouts,
 * single retry on transient failures, hard backoff semantics (ADR-0005).
 * Every external call in the app goes through here.
 */

export class IntegrationError extends Error {
  constructor(
    readonly source: string,
    readonly kind: "network" | "status" | "parse" | "timeout",
    readonly detail: string,
  ) {
    super(`${source}: ${kind} — ${detail}`);
    this.name = "IntegrationError";
  }
}

const APP_UA = `Maqrivo/0.1 (+https://maqrivo.local; contact via OFF_USER_AGENT_EMAIL)`;

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
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": APP_UA, accept, ...headers },
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
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": APP_UA, accept: "image/*", ...headers },
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
