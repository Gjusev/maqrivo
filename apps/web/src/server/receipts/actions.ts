"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  aiExtraction,
  foodConcept,
  priceObservation,
  product,
  receipt,
  receiptLine,
  sourceEvidence,
  store,
} from "@maqrivo/db";
import { getSessionContext } from "../session";
import { getAIProvider } from "../ai/provider";
import { readImage } from "../storage";
import { receiptLinesFromExtraction, type ReceiptLineCandidate } from "./extraction";
import { resolveProduct, type ProductCandidate } from "@maqrivo/core";
import { addPantryItemAction } from "../recipes/actions";
import { writeReceiptLineToOpenPrices, type OpenPricesWritebackResult } from "./openprices-writeback";

export interface ReceiptLineView {
  id: string;
  label: string;
  amountCents: number;
  quantityKg: number | null;
  confirmed: boolean;
  productId: string | null;
  productName: string | null;
  conceptId: string | null;
  conceptNameFr: string | null;
  conceptNameEn: string | null;
  suggestion: { productId: string; name: string } | null;
}

/** Deterministic product suggestion for a receipt label (never auto-linked). */
async function suggestProductForLabel(label: string, userId: string) {
  const products = await db
    .select({
      id: product.id,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      externalIds: product.externalIds,
      packageQuantity: product.packageQuantity,
      packageUnit: product.packageUnit,
    })
    .from(product)
    .where(or(eq(product.ownerUserId, userId), isNull(product.ownerUserId)))
    .limit(500);
  const candidates: ProductCandidate[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    barcode: p.barcode,
    retailerProductIds: (p.externalIds as Record<string, string> | null) ?? {},
    packageQuantity: p.packageQuantity !== null ? Number(p.packageQuantity) : null,
    packageUnit: p.packageUnit,
  }));
  const resolution = resolveProduct(
    { name: label, brand: null, barcode: null, retailerId: null, retailerProductId: null, packageQuantity: null, packageUnit: null },
    candidates,
  );
  if ((resolution.state === "EXACT" || resolution.state === "PROBABLE") && resolution.productId !== null) {
    const matched = products.find((p) => p.id === resolution.productId);
    return { productId: resolution.productId, name: matched?.name ?? label };
  }
  return null;
}

export async function extractReceiptAction(receiptId: string): Promise<{
  ok: boolean;
  error?: string;
  lines?: ReceiptLineCandidate[];
}> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const provider = getAIProvider();
  if (!provider.configured) return { ok: false, error: "ai-not-configured" };

  const row = (await db.select().from(receipt).where(eq(receipt.id, receiptId)).limit(1))[0];
  if (!row || row.userId !== session.userId) return { ok: false, error: "not-found" };

  const evidence = row.evidenceId
    ? (await db.select().from(sourceEvidence).where(eq(sourceEvidence.id, row.evidenceId)).limit(1))[0]
    : undefined;
  if (!evidence?.storageKey) return { ok: false, error: "no-photo" };

  let buffer: Buffer;
  try {
    buffer = await readImage(evidence.storageKey);
  } catch {
    return { ok: false, error: "image-unreadable" };
  }
  const mime = evidence.storageKey.endsWith(".png")
    ? "image/png"
    : evidence.storageKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  let raw;
  try {
    raw = await provider.analyzeImage({
      system:
        "You read supermarket cash-register receipts for a grocery app. Extract PRODUCT lines only. " +
        "amount is the euro amount printed for the line (number, e.g. 4.99). quantityKg is the weight in kg " +
        "when the line is sold by weight (e.g. 0.642). EXCLUDE totals, payments, loyalty, VAT, store info, dates. " +
        'Answer with JSON only: {"lines":[{"label","amount","quantityKg"}]}',
      prompt: "Extract the product lines from this receipt.",
      imageDataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      schema: z.object({ lines: z.array(z.unknown()) }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "ai-failed" };
  }

  const candidates = receiptLinesFromExtraction(raw);
  await db.delete(receiptLine).where(and(eq(receiptLine.receiptId, receiptId), eq(receiptLine.confirmed, false)));
  const kept = await db.select().from(receiptLine).where(eq(receiptLine.receiptId, receiptId));
  for (const candidate of candidates) {
    const suggestion = await suggestProductForLabel(candidate.label, session.userId);
    // Idempotent: existing labels update their suggestion (unless confirmed);
    // new labels are inserted. Confirmed lines always survive untouched.
    const existing = kept.find((k) => k.label.toLowerCase() === candidate.label.toLowerCase());
    if (existing) {
      if (!existing.confirmed && !existing.productId && suggestion) {
        await db.update(receiptLine).set({ productId: suggestion.productId }).where(eq(receiptLine.id, existing.id));
      }
      continue;
    }
    await db.insert(receiptLine).values({
      receiptId,
      label: candidate.label,
      amountCents: candidate.amountCents,
      quantityKg: candidate.quantityKg !== null ? String(candidate.quantityKg) : null,
      productId: suggestion?.productId ?? null,
    });
  }
  await db.update(receipt).set({ processedAt: new Date() }).where(eq(receipt.id, receiptId));
  await db.insert(aiExtraction).values({
    kind: "product_photo", // closest existing enum for image extraction runs
    userId: session.userId,
    inputEvidenceId: evidence.id,
    model: process.env.ZAI_VISION_MODEL ?? "glm-5.3-flash",
    promptVersion: "receipt-v1",
    output: { receiptId, lineCount: candidates.length },
    validationStatus: candidates.length > 0 ? "valid" : "rejected",
  });

  revalidatePath(`/shopping/receipts/${receiptId}`);
  return { ok: true, lines: candidates };
}

/** Confirm a line: creates the price observation (receipt-sourced, evidence-linked). */
export async function confirmReceiptLineAction(
  lineId: string,
  productIdOverride?: string | null,
): Promise<{ ok: boolean; error?: string; writeback?: OpenPricesWritebackResult["status"] }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const line = (await db.select().from(receiptLine).where(eq(receiptLine.id, lineId)).limit(1))[0];
  if (!line) return { ok: false, error: "line-not-found" };
  const parent = (await db.select().from(receipt).where(eq(receipt.id, line.receiptId)).limit(1))[0];
  if (!parent || parent.userId !== session.userId) return { ok: false, error: "forbidden" };

  const productId = productIdOverride !== undefined ? productIdOverride : line.productId;
  if (!productId) {
    // No product: confirm as a plain purchase record — no observation (no guessing).
    await db.update(receiptLine).set({ confirmed: true }).where(eq(receiptLine.id, lineId));
    await refreshReceiptTotal(parent.id);
    revalidatePath(`/shopping/receipts/${parent.id}`);
    return { ok: true };
  }

  // Per-kg lines record the derived per-kg price (line amount ÷ weight).
  const existing = line.priceObservationId
    ? (await db.select().from(priceObservation).where(eq(priceObservation.id, line.priceObservationId)).limit(1))[0]
    : undefined;
  let createdObservationId: string | null = null;
  if (existing) {
    await db.update(priceObservation).set({ productId }).where(eq(priceObservation.id, existing.id));
  } else {
    const inserted = (
      await db
        .insert(priceObservation)
        .values({
          productId,
          storeId: parent.storeId,
          amountCents:
            line.quantityKg !== null
              ? Math.round(line.amountCents / Number(line.quantityKg))
              : line.amountCents,
          priceBasis: line.quantityKg !== null ? "per_kg" : "unit",
          observedAt: new Date(`${parent.purchasedOn}T12:00:00Z`),
          source: "receipt",
          evidenceId: parent.evidenceId,
          createdByUserId: session.userId,
        })
        .returning()
    )[0]!;
    createdObservationId = inserted.id;
    await db
      .update(receiptLine)
      .set({ confirmed: true, productId, priceObservationId: inserted.id })
      .where(eq(receiptLine.id, lineId));
  }

  // Refresh the receipt total from confirmed lines (honest bookkeeping).
  await refreshReceiptTotal(parent.id);

  // External contribution is optional and deliberately follows the local
  // commit. A timeout or rejected proof never rolls back the user's receipt.
  const writeback = createdObservationId
    ? await writeReceiptLineToOpenPrices({
        receiptId: parent.id,
        lineId,
        priceObservationId: createdObservationId,
      })
    : undefined;

  revalidatePath(`/shopping/receipts/${parent.id}`);
  revalidatePath("/shopping");
  return { ok: true, ...(writeback ? { writeback: writeback.status } : {}) };
}

async function refreshReceiptTotal(receiptId: string): Promise<void> {
  const lines = await db.select().from(receiptLine).where(eq(receiptLine.receiptId, receiptId));
  const total = lines.filter((l) => l.confirmed).reduce((sum, l) => sum + l.amountCents, 0);
  await db.update(receipt).set({ totalCents: total }).where(eq(receipt.id, receiptId));
}

/** Add a confirmed line's product to the pantry (post-shopping restock). */
export async function addReceiptLineToPantryAction(lineId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };

  const line = (await db.select().from(receiptLine).where(eq(receiptLine.id, lineId)).limit(1))[0];
  if (!line) return { ok: false, error: "line-not-found" };
  const parent = (await db.select().from(receipt).where(eq(receipt.id, line.receiptId)).limit(1))[0];
  if (!parent || parent.userId !== session.userId) return { ok: false, error: "forbidden" };
  if (!line.productId) return { ok: false, error: "no-product" };

  const productRow = (
    await db
      .select({ product: product, concept: foodConcept })
      .from(product)
      .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
      .where(eq(product.id, line.productId))
      .limit(1)
  )[0];

  const result = await addPantryItemAction({
    productId: line.productId,
    foodConceptId: productRow?.concept?.id,
    quantity: 1,
    unit: "unit",
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function listReceipts(): Promise<
  { id: string; storeName: string; purchasedOn: string; totalCents: number | null; lineCount: number }[]
> {
  const session = await getSessionContext();
  if (!session) return [];
  const rows = await db
    .select({ receipt: receipt, storeName: store.name })
    .from(receipt)
    .innerJoin(store, eq(receipt.storeId, store.id))
    .where(eq(receipt.userId, session.userId))
    .orderBy(desc(receipt.purchasedOn), desc(receipt.createdAt))
    .limit(30);
  const countRows = await db
    .select({ receiptId: receiptLine.receiptId, lineCount: count() })
    .from(receiptLine)
    .groupBy(receiptLine.receiptId);
  const lineCountByReceipt = new Map(countRows.map((r) => [r.receiptId, r.lineCount]));
  return rows.map(({ receipt: r, storeName }) => ({
    id: r.id,
    storeName,
    purchasedOn: r.purchasedOn,
    totalCents: r.totalCents,
    lineCount: lineCountByReceipt.get(r.id) ?? 0,
  }));
}

export async function getReceiptLines(receiptId: string): Promise<ReceiptLineView[]> {
  const session = await getSessionContext();
  if (!session) return [];
  const parent = (await db.select().from(receipt).where(eq(receipt.id, receiptId)).limit(1))[0];
  if (!parent || parent.userId !== session.userId) return [];
  const rows = await db
    .select({ line: receiptLine, product: product, concept: foodConcept })
    .from(receiptLine)
    .leftJoin(product, eq(receiptLine.productId, product.id))
    .leftJoin(foodConcept, eq(product.foodConceptId, foodConcept.id))
    .where(eq(receiptLine.receiptId, receiptId));
  return Promise.all(
    rows.map(async ({ line, product: p, concept }) => {
      const suggestion = !line.productId ? await suggestProductForLabel(line.label, session.userId) : null;
      return {
        id: line.id,
        label: line.label,
        amountCents: line.amountCents,
        quantityKg: line.quantityKg !== null ? Number(line.quantityKg) : null,
        confirmed: line.confirmed,
        productId: p?.id ?? null,
        productName: p?.name ?? null,
        conceptId: concept?.id ?? null,
        conceptNameFr: concept?.nameFr ?? null,
        conceptNameEn: concept?.nameEn ?? null,
        suggestion,
      };
    }),
  );
}

export async function deleteReceiptAction(receiptId: string): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  await db.delete(receipt).where(and(eq(receipt.id, receiptId), eq(receipt.userId, session.userId)));
  revalidatePath("/shopping/receipts");
  return { ok: true };
}
