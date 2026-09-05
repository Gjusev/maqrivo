/**
 * Remote catalogue ingestion: pulls leaflet page images from a retailer's
 * flipbook source into the same evidence-backed pipeline as user photo
 * uploads. Politeness caps per run; content-hash dedup means unchanged
 * pages are never re-fetched into AI analysis.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { catalogue, cataloguePage, ingestionRun, retailer, sourceEvidence, store, userStorePrefs } from "@maqrivo/db";
import { politeFetchImage, IntegrationError } from "../integrations/http";
import { saveImage } from "../storage";
import { flipbookSourceFor, type RemoteCatalogue } from "../integrations/retailers/flipbook";

/** Politeness budget per run, per store (ADR-0005). */
const MAX_CATALOGUES_PER_STORE = 3;
const MAX_PAGES_PER_CATALOGUE = 12;

export interface StoreSyncResult {
  storeId: string;
  catalogues: number;
  newPages: number;
  unchangedPages: number;
}

/** Ingest the current catalogues of one store through a flipbook source. */
export async function syncRemoteCatalogues(input: {
  retailerSlug: string;
  storeId: string;
  storeRef: string;
  source: (storeRef: string) => Promise<RemoteCatalogue[]>;
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

  const result: StoreSyncResult = { storeId: input.storeId, catalogues: 0, newPages: 0, unchangedPages: 0 };
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

      for (const [index, pageUrl] of rc.pageImageUrls.slice(0, MAX_PAGES_PER_CATALOGUE).entries()) {
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
        stats: { catalogues: result.catalogues, newPages: result.newPages, unchangedPages: result.unchangedPages },
        warnings,
      })
      .where(eq(ingestionRun.id, run.id));
  } catch (err) {
    await db
      .update(ingestionRun)
      .set({
        status: result.newPages > 0 ? "partial" : "failed",
        finishedAt: new Date(),
        stats: { catalogues: result.catalogues, newPages: result.newPages, unchangedPages: result.unchangedPages },
        warnings,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      })
      .where(eq(ingestionRun.id, run.id));
    throw err;
  }
  return result;
}

/**
 * Job entry: for every registered flipbook source, ingest the catalogues
 * of user-enabled stores that carry that retailer's external ref.
 */
export async function runCatalogueSync(): Promise<{ stores: number; newPages: number }> {
  const rows = await db
    .select({ store: store, slug: retailer.slug })
    .from(store)
    .innerJoin(retailer, eq(store.retailerId, retailer.id));

  let stores = 0;
  let newPages = 0;
  for (const row of rows) {
    const source = flipbookSourceFor(row.slug);
    if (!source) continue;
    const storeRef = row.store.externalIds?.[row.slug];
    if (!storeRef) continue;
    // Enabled-store gate: only stores a user opted into get fetched.
    const enabled = (
      await db
        .select({ id: userStorePrefs.id })
        .from(userStorePrefs)
        .where(and(eq(userStorePrefs.storeId, row.store.id), eq(userStorePrefs.enabled, true)))
        .limit(1)
    )[0];
    if (!enabled) continue;

    try {
      const result = await syncRemoteCatalogues({
        retailerSlug: row.slug,
        storeId: row.store.id,
        storeRef,
        source,
      });
      stores += 1;
      newPages += result.newPages;
    } catch (err) {
      // One store failing never blocks the others; the run row records it.
      console.error(`[catalogue-sync] ${row.slug}/${row.store.name}:`, err instanceof Error ? err.message : err);
    }
  }
  return { stores, newPages };
}
