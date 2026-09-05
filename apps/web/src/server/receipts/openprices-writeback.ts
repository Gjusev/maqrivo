/**
 * Best-effort receipt contribution to Open Prices. Local confirmation is the
 * source of truth: this function runs only after it commits and never turns an
 * external outage into a failed purchase action.
 */
import { eq } from "drizzle-orm";
import { priceObservation, product, receipt, receiptLine, sourceEvidence, store } from "@maqrivo/db";
import { db } from "../db";
import { readImage } from "../storage";
import {
  OpenPricesWriteClient,
  openPricesWriteConfig,
  type OpenPricesWriteConfig,
} from "../integrations/openprices-write";
import { osmReferenceFromExternalIds } from "../integrations/osm/reference";

export type OpenPricesWritebackResult =
  | { readonly status: "published"; readonly proofId: number; readonly priceId: number }
  | {
      readonly status:
        | "disabled"
        | "credentials-missing"
        | "invalid-api-base"
        | "ineligible"
        | "failed";
      readonly detail?: string;
    };

let cachedClient: { key: string; client: OpenPricesWriteClient } | null = null;

function clientFor(config: OpenPricesWriteConfig): OpenPricesWriteClient {
  const key = `${config.apiBase}\n${config.username}`;
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new OpenPricesWriteClient(config) };
  }
  return cachedClient.client;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function imageMime(storageKey: string): "image/jpeg" | "image/png" | "image/webp" | null {
  if (/\.png$/i.test(storageKey)) return "image/png";
  if (/\.webp$/i.test(storageKey)) return "image/webp";
  if (/\.jpe?g$/i.test(storageKey)) return "image/jpeg";
  return null;
}

function safeDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

export async function writeReceiptLineToOpenPrices(input: {
  receiptId: string;
  lineId: string;
  priceObservationId: string;
}): Promise<OpenPricesWritebackResult> {
  const state = openPricesWriteConfig();
  if (!state.enabled) return { status: state.reason };

  const row = (
    await db
      .select({
        receipt,
        line: receiptLine,
        observation: priceObservation,
        product,
        store,
        evidence: sourceEvidence,
      })
      .from(receiptLine)
      .innerJoin(receipt, eq(receiptLine.receiptId, receipt.id))
      .innerJoin(priceObservation, eq(receiptLine.priceObservationId, priceObservation.id))
      .innerJoin(product, eq(priceObservation.productId, product.id))
      .innerJoin(store, eq(receipt.storeId, store.id))
      .innerJoin(sourceEvidence, eq(receipt.evidenceId, sourceEvidence.id))
      .where(eq(receiptLine.id, input.lineId))
      .limit(1)
  )[0];

  if (
    !row ||
    row.receipt.id !== input.receiptId ||
    row.observation.id !== input.priceObservationId ||
    row.observation.openpricesId
  ) {
    return { status: "ineligible" };
  }

  const productCode = (row.product.barcode ?? row.product.externalIds?.off)?.trim();
  const osmReference = osmReferenceFromExternalIds(row.store.externalIds);
  const mime = row.evidence.storageKey ? imageMime(row.evidence.storageKey) : null;
  if (
    !productCode ||
    !/^\d{6,14}$/.test(productCode) ||
    !osmReference ||
    !row.evidence.storageKey ||
    !mime ||
    row.observation.amountCents <= 0
  ) {
    return { status: "ineligible" };
  }

  const payload = objectValue(row.evidence.payload);
  const prior = objectValue(payload.openpricesWriteback);
  let proofId =
    prior.apiBase === state.config.apiBase &&
    typeof prior.proofId === "number" &&
    Number.isSafeInteger(prior.proofId) &&
    prior.proofId > 0
      ? prior.proofId
      : null;

  try {
    const client = clientFor(state.config);
    if (proofId === null) {
      const bytes = await readImage(row.evidence.storageKey);
      proofId = await client.uploadReceiptProof({
        bytes,
        mime,
        filename: row.evidence.storageKey.split(/[\\/]/).at(-1) ?? "receipt.jpg",
        purchasedOn: row.receipt.purchasedOn,
        currency: row.observation.currency,
        osmId: osmReference.id,
        osmType: osmReference.type,
      });
      await db
        .update(sourceEvidence)
        .set({
          payload: {
            ...payload,
            openpricesWriteback: {
              apiBase: state.config.apiBase,
              proofId,
              uploadedAt: new Date().toISOString(),
            },
          },
        })
        .where(eq(sourceEvidence.id, row.evidence.id));
    }

    const quantityKg = row.line.quantityKg === null ? undefined : Number(row.line.quantityKg);
    const priceId = await client.createReceiptPrice({
      proofId,
      productCode,
      amountCents: row.observation.amountCents,
      pricePer: row.observation.priceBasis === "per_kg" ? "KILOGRAM" : "UNIT",
      purchasedOn: row.receipt.purchasedOn,
      currency: row.observation.currency,
      osmId: osmReference.id,
      osmType: osmReference.type,
      ...(quantityKg !== undefined && Number.isFinite(quantityKg) && quantityKg > 0
        ? { receiptQuantity: quantityKg }
        : {}),
    });
    await db
      .update(priceObservation)
      .set({ openpricesId: String(priceId) })
      .where(eq(priceObservation.id, row.observation.id));
    return { status: "published", proofId, priceId };
  } catch (error) {
    return { status: "failed", detail: safeDetail(error) };
  }
}
