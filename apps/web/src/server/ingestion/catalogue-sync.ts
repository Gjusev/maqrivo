/**
 * Remote catalogue ingestion. Two modes, decided by the adapter's data:
 * - structured items → promotions straight from the retailer payload
 *   (EAN-keyed where available) with deterministic product matching —
 *   no AI step;
 * - page image URLs only → images enter the same evidence-backed vision
 *   pipeline as user photo uploads.
 * Politeness caps per run; content-hash dedup means unchanged pages are
 * never re-analyzed; promotion dedup keys on (catalogue, label, barcode).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  catalogue,
  cataloguePage,
  ingestionRun,
  promotion,
  retailer,
  sourceEvidence,
  store,
  userStorePrefs,
} from "@maqrivo/db";
import { IntegrationError, politeFetchImage } from "../integrations/http";
import { saveImage } from "../storage";
import {
  flipbookRegistrations,
  type RemoteCatalogue,
} from "../integrations/retailers/flipbook";
import { tryMatchPromotionProduct } from "./promotions";

/** Politeness budget per run, per store (ADR-0005). */
const MAX_CATALOGUES_PER_STORE = 3;
const MAX_PAGES_PER_CATALOGUE = 12;
const MAX_ITEMS_PER_CATALOGUE = 60;

export interface StoreSyncResult {
  storeId: string | null;
  catalogues: number;
  newPages: number;
  unchangedPages: number;
  newPromotions: number;
}

/** Ingest the current catalogues of one store through a flipbook source. */
export async function syncRemoteCatalogues(input: {
  retailerSlug: string;
  storeId: string | null;
  storeRef: string | null;
  source: (storeRef: string | null) => Promise<RemoteCatalogue[]>;
}): Promise<StoreSyncResult> {
  const run = (
    await db
      .insert(ingestionRun)
      .values({
        source: input.retailerSlug,
        kind: "catalogue_ingestion",
        status: "running",
        stats: {},
        warnings: [],
      })
      .returning()
  )[0]!;

  const result: StoreSyncResult = {
    storeId: input.storeId,
    catalogues: 0,
    newPages: 0,
    unchangedPages: 0,
    newPromotions: 0,
  };
  const warnings: string[] = [];
  try {
    const retailerRow = (
      await db.select().from(retailer).where(eq(retailer.slug, input.retailerSlug)).limit(1)
    )[0];
    if (!retailerRow) throw new IntegrationError(input.retailerSlug, "parse", "unknown retailer slug");

    const remote = (await input.source(input.storeRef)).slice(0, MAX_CATALOGUES_PER_STORE);
    for (const rc of remote) {
      const catRow = (
        await db
          .insert(catalogue)
          .values({
            retailerId: retailerRow.id,
            storeId: input.storeId,
            externalId: rc.externalId,
            title: rc.title,
            validFrom: rc.validFrom,
            validUntil: rc.validUntil,
          })
          .onConflictDoUpdate({
            target: [catalogue.retailerId, catalogue.externalId],
            set: {
              title: rc.title,
              validFrom: rc.validFrom,
              validUntil: rc.validUntil,
            },
          })
          .returning()
      )[0]!;
      result.catalogues += 1;

      if (rc.items.length > 0) {
        result.newPromotions += await ingestStructuredItems({
          retailerId: retailerRow.id,
          storeId: input.storeId,
          catalogueId: catRow.id,
          catalogue: rc,
        });
        continue;
      }

      for (const [index, pageUrl] of rc.pageImageUrls.slice(0, MAX_PAGES_PER_CATALOGUE).entries()) {
        if (!pageUrl) continue;
        const pageNumber = index + 1;
        const existing = (
          await db
            .select()
            .from(cataloguePage)
            .where(and(eq(cataloguePage.catalogueId, catRow.id), eq(cataloguePage.pageNumber, pageNumber)))
            .limit(1)
        )[0];

        const image = await politeFetchImage(pageUrl, { source: input.retailerSlug });
        const { storageKey, contentHash } = await saveImage(`catalogues/${catRow.id}`, {
          mime: image.mime,
          bytes: image.bytes,
        });

        if (existing && existing.contentHash === contentHash) {
          // Unchanged page: never re-enters the AI pipeline.
          result.unchangedPages += 1;
          continue;
        }

        await db.insert(sourceEvidence).values({
          kind: "catalogue_page",
          retailerId: retailerRow.id,
          storeId: input.storeId,
          catalogueId: catRow.id,
          page: pageNumber,
          url: pageUrl,
          storageKey,
          contentHash,
        });
        if (existing) {
          await db
            .update(cataloguePage)
            .set({ imageKey: storageKey, contentHash, processedAt: null, sourceUrl: pageUrl })
            .where(eq(cataloguePage.id, existing.id));
        } else {
          await db
            .insert(cataloguePage)
            .values({ catalogueId: catRow.id, pageNumber, imageKey: storageKey, contentHash, sourceUrl: pageUrl });
        }
        result.newPages += 1;
      }
    }

    await db
      .update(ingestionRun)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        stats: {
          catalogues: result.catalogues,
          newPages: result.newPages,
          unchangedPages: result.unchangedPages,
          newPromotions: result.newPromotions,
        },
        warnings,
      })
      .where(eq(ingestionRun.id, run.id));
  } catch (err) {
    await db
      .update(ingestionRun)
      .set({
        status: result.newPages + result.newPromotions > 0 ? "partial" : "failed",
        finishedAt: new Date(),
        stats: {
          catalogues: result.catalogues,
          newPages: result.newPages,
          unchangedPages: result.unchangedPages,
          newPromotions: result.newPromotions,
        },
        warnings,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      })
      .where(eq(ingestionRun.id, run.id));
    throw err;
  }
  return result;
}

/**
 * Structured items → promotions. The retailer's own payload is the
 * evidence; page image URL doubles as the view-source. Deterministic
 * product matching runs per item (EAN → EXACT when the product exists).
 */
async function ingestStructuredItems(input: {
  retailerId: string;
  storeId: string | null;
  catalogueId: string;
  catalogue: RemoteCatalogue;
}): Promise<number> {
  const existing = await db
    .select({ descriptionRaw: promotion.descriptionRaw, barcode: promotion.barcode })
    .from(promotion)
    .where(eq(promotion.catalogueId, input.catalogueId));
  const seen = new Set(existing.map((p) => `${p.descriptionRaw}|${p.barcode ?? ""}`));

  let created = 0;
  for (const item of input.catalogue.items.slice(0, MAX_ITEMS_PER_CATALOGUE)) {
    const key = `${item.label}|${item.ean ?? ""}`;
    if (seen.has(key)) continue; // idempotent across runs
    seen.add(key);

    const pageUrl =
      (item.page != null ? input.catalogue.pageImageUrls[item.page - 1] || null : null) ??
      input.catalogue.sourceUrl ??
      null;
    const evidence =
      (
        await db
          .insert(sourceEvidence)
          .values({
            kind: "catalogue_page",
            retailerId: input.retailerId,
            storeId: input.storeId,
            catalogueId: input.catalogueId,
            page: item.page,
            url: pageUrl,
            rawExcerpt: item.validityText,
          })
          .returning()
      )[0] ?? undefined;

    const inserted = (
      await db
        .insert(promotion)
        .values({
          retailerId: input.retailerId,
          catalogueId: input.catalogueId,
          storeId: input.storeId,
          descriptionRaw: item.label,
          brand: item.brand,
          barcode: item.ean,
          regularPriceCents: item.regularPriceCents,
          promoPriceCents: item.priceCents,
          pricePerKgCents: item.pricePerKgCents,
          mechanism: item.mechanism ?? (item.loyalty ? "LOYALTY_PRICE" : "PROMO_PRICE"),
          minQty: item.minQty ?? null,
          payQty: item.payQty ?? null,
          getQty: item.getQty ?? null,
          discountPct: item.discountPct ?? null,
          loyaltyRequired: item.loyalty,
          conditionsRaw: item.conditionsRaw ?? null,
          validFrom: input.catalogue.validFrom,
          validUntil: input.catalogue.validUntil,
          source: "catalogue",
          verification: "EXTRACTED",
          confidence: "HIGH", // structured retailer data, not AI vision
          evidenceId: evidence?.id,
        })
        .returning()
    )[0]!;

    await tryMatchPromotionProduct(inserted.id, item.ean, item.brand, item.label);
    created += 1;
  }
  return created;
}

/**
 * Job entry: for every registered flipbook adapter, ingest the catalogues
 * of user-enabled stores (store-keyed) or the national catalogue (once,
 * when any store of that retailer is enabled).
 */
export async function runCatalogueSync(): Promise<{ stores: number; newPages: number; newPromotions: number }> {
  let stores = 0;
  let newPages = 0;
  let newPromotions = 0;

  for (const [slug, registration] of flipbookRegistrations()) {
    const retailerRow = (await db.select().from(retailer).where(eq(retailer.slug, slug)).limit(1))[0];
    if (!retailerRow) continue;
    const retailerStores = await db.select().from(store).where(eq(store.retailerId, retailerRow.id));
    const storeIds = new Set(retailerStores.map((s) => s.id));

    const enabled = storeIds.size
      ? (
          await db
            .select({ storeId: userStorePrefs.storeId })
            .from(userStorePrefs)
            .where(eq(userStorePrefs.enabled, true))
        )
            .filter((row) => storeIds.has(row.storeId))
            .map((row) => row.storeId)
      : [];
    if (enabled.length === 0) continue; // two-tier gate: no enabled store, no fetch

    if (!registration.storeKeyed) {
      try {
        const result = await syncRemoteCatalogues({
          retailerSlug: slug,
          storeId: null,
          storeRef: null,
          source: registration.source,
        });
        stores += 1;
        newPages += result.newPages;
        newPromotions += result.newPromotions;
      } catch (err) {
        console.error(`[catalogue-sync] ${slug}/national:`, err instanceof Error ? err.message : err);
      }
      continue;
    }

    for (const storeRow of retailerStores) {
      const storeRef = storeRow.externalIds?.[slug];
      if (!storeRef || !enabled.includes(storeRow.id)) continue;
      try {
        const result = await syncRemoteCatalogues({
          retailerSlug: slug,
          storeId: storeRow.id,
          storeRef,
          source: registration.source,
        });
        stores += 1;
        newPages += result.newPages;
        newPromotions += result.newPromotions;
      } catch (err) {
        // One store failing never blocks the others; the run row records it.
        console.error(`[catalogue-sync] ${slug}/${storeRow.name}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return { stores, newPages, newPromotions };
}
