/**
 * Credential-gated Open Prices writes. Unlike anonymous reads, every call is
 * explicit and single-attempt: retrying an ambiguous POST could duplicate a
 * public contribution. The upstream proof endpoint independently deduplicates
 * identical images, while Maqrivo persists returned proof/price ids locally.
 */
import { z } from "zod";
import { APP_USER_AGENT, IntegrationError } from "./http";

const SOURCE = "openprices-write";
const DEFAULT_WRITE_API = "https://prices.openfoodfacts.net/api/v1";
const ALLOWED_WRITE_APIS = new Set([
  DEFAULT_WRITE_API,
  "https://prices.openfoodfacts.org/api/v1",
]);
const APP_QUERY = "app_name=Maqrivo&app_version=0.1.0&app_platform=web";

const sessionSchema = z.object({ access_token: z.string().min(1) }).loose();
const proofSchema = z.object({ id: z.number().int().positive() }).loose();
const priceSchema = z.object({ id: z.number().int().positive() }).loose();

export interface OpenPricesWriteConfig {
  readonly apiBase: string;
  readonly username: string;
  readonly password: string;
}

export type OpenPricesWriteConfigState =
  | { readonly enabled: false; readonly reason: "disabled" | "credentials-missing" | "invalid-api-base" }
  | { readonly enabled: true; readonly config: OpenPricesWriteConfig };

export function openPricesWriteConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpenPricesWriteConfigState {
  if (env.OPENPRICES_WRITE_ENABLED !== "true") return { enabled: false, reason: "disabled" };
  const username = env.OPENPRICES_USERNAME?.trim();
  const password = env.OPENPRICES_PASSWORD;
  if (!username || !password) return { enabled: false, reason: "credentials-missing" };
  const apiBase = (env.OPENPRICES_WRITE_API_BASE?.trim() || DEFAULT_WRITE_API).replace(/\/+$/, "");
  if (!ALLOWED_WRITE_APIS.has(apiBase)) return { enabled: false, reason: "invalid-api-base" };
  return { enabled: true, config: { apiBase, username, password } };
}

export interface OpenPricesReceiptProofInput {
  readonly bytes: Uint8Array;
  readonly mime: "image/jpeg" | "image/png" | "image/webp";
  readonly filename: string;
  readonly purchasedOn: string;
  readonly currency: string;
  readonly osmId: number;
  readonly osmType: "NODE" | "WAY" | "RELATION";
}

export interface OpenPricesReceiptPriceInput {
  readonly proofId: number;
  readonly productCode: string;
  readonly amountCents: number;
  readonly pricePer: "UNIT" | "KILOGRAM";
  readonly purchasedOn: string;
  readonly currency: string;
  readonly osmId: number;
  readonly osmType: "NODE" | "WAY" | "RELATION";
  readonly receiptQuantity?: number;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class OpenPricesWriteClient {
  private accessToken: string | null = null;

  constructor(
    private readonly config: OpenPricesWriteConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async uploadReceiptProof(input: OpenPricesReceiptProofInput): Promise<number> {
    const form = new FormData();
    const imageBuffer = new ArrayBuffer(input.bytes.byteLength);
    new Uint8Array(imageBuffer).set(input.bytes);
    form.append("file", new Blob([imageBuffer], { type: input.mime }), input.filename);
    form.append("type", "RECEIPT");
    form.append("location_osm_id", String(input.osmId));
    form.append("location_osm_type", input.osmType);
    form.append("currency", input.currency);
    form.append("date", input.purchasedOn);
    const json = await this.authorizedJson(
      `${this.config.apiBase}/proofs/upload?${APP_QUERY}`,
      { method: "POST", body: form },
      [200, 201],
    );
    return proofSchema.parse(json).id;
  }

  async createReceiptPrice(input: OpenPricesReceiptPriceInput): Promise<number> {
    const payload = {
      type: "PRODUCT",
      product_code: input.productCode,
      price: input.amountCents / 100,
      price_per: input.pricePer,
      currency: input.currency,
      date: input.purchasedOn,
      location_osm_id: input.osmId,
      location_osm_type: input.osmType,
      proof_id: input.proofId,
      ...(input.receiptQuantity !== undefined
        ? { receipt_quantity: input.receiptQuantity }
        : {}),
    };
    const json = await this.authorizedJson(
      `${this.config.apiBase}/prices?${APP_QUERY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      [201],
    );
    return priceSchema.parse(json).id;
  }

  private async authenticate(): Promise<string> {
    const form = new URLSearchParams({
      username: this.config.username,
      password: this.config.password,
    });
    const json = await this.requestJson(
      `${this.config.apiBase}/auth`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      },
      [200],
    );
    const token = sessionSchema.parse(json).access_token;
    this.accessToken = token;
    return token;
  }

  private async authorizedJson(
    url: string,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<unknown> {
    const token = this.accessToken ?? (await this.authenticate());
    return this.requestJson(
      url,
      {
        ...init,
        headers: { ...headersRecord(init.headers), authorization: `Bearer ${token}` },
      },
      expectedStatuses,
    );
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    expectedStatuses: readonly number[],
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "User-Agent": APP_USER_AGENT,
          accept: "application/json",
          ...headersRecord(init.headers),
        },
      });
      if (!expectedStatuses.includes(response.status)) {
        throw new IntegrationError(SOURCE, "status", `HTTP ${response.status}`);
      }
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        throw new IntegrationError(
          SOURCE,
          "parse",
          error instanceof Error ? error.message : "invalid JSON response",
        );
      }
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(
        SOURCE,
        error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  return Object.fromEntries(new Headers(headers).entries());
}
