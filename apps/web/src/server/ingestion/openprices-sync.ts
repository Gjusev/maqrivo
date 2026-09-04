/**
 * Open Prices → price observations sync for enabled stores.
 * Store matching is by OSM node id (our stores carry osm_node in externalIds).
 * Only prices for products we already know are imported (barcode/OFF match);
 * unmatched prices are counted, never guessed onto wrong products.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { ingestionRun, priceObservation, product, store, userStorePrefs } from "@maqrivo/db";
import { fetchOpenPricesAtLocation, findOpenPricesLocations } from "../integrations/openprices";
import { snapToGrid } from "@maqrivo/core";

export interface SyncResult {
  storesConsidered: number;
  storesMatched: number;
  pricesSeen: number;
  observationsImported: number;
  unmatchedProducts: number;
  warnings: string[];
}

export async function runOpenPricesSync(): Promise<SyncResult> {
  const run = (
    await db
      .insert(ingestionRun)
      .values({ source: "openprices", kind: "price_refresh", status: "running" })
      .returning()
  )[0]!;

  const warnings: string[] = [];
  const result: SyncResult = {
    storesConsidered: 0,
    storesMatched: 0,
    pricesSeen: 0,
    observationsImported: 0,
    unmatchedProducts: 0,
    warnings,
  };

  try {
    // Enabled stores that came from OSM (carry osm_node).
    const enabled = await db
      .select({ store: store })
      .from(userStorePrefs)
      .innerJoin(store, eq(userStorePrefs.storeId, store.id))
      .where(eq(userStorePrefs.enabled, true));
    const osmStores = enabled.map((e) => e.store).filter((s) => s.externalIds?.osm_node);

    result.storesConsidered = osmStores.length;
    if (osmStores.length === 0) {
      await finishRun(run.id, "succeeded", result, warnings);
      return result;
    }

    // Location index: one nearby query per ~1.5 km cell around the first store.
    const seenCells = new Set<string>();
    const locationByOsm = new Map<number, number>();
    for (const s of osmStores) {
      const center = snapToGrid({ lat: s.lat, lng: s.lng }, 1500);
      const cellKey = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
      if (!seenCells.has(cellKey)) {
        seenCells.add(cellKey);
        try {
          const locations = await findOpenPricesLocations(center, 2);
          for (const loc of locations) {
            if (loc.osmNodeId != null) locationByOsm.set(loc.osmNodeId, loc.locationId);
          }
        } catch (err) {
          warnings.push(`locations/nearby ${cellKey}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    }

    for (const s of osmStores) {
      const osmNode = Number(s.externalIds?.osm_node);
      const locationId = locationByOsm.get(osmNode);
      if (!locationId) continue;
      result.storesMatched += 1;

      let prices;
      try {
        prices = await fetchOpenPricesAtLocation(locationId);
      } catch (err) {
        warnings.push(`prices loc=${locationId}: ${err instanceof Error ? err.message : "failed"}`);
        continue;
      }
      result.pricesSeen += prices.length;

      // Known products by OFF id / barcode.
      const offIds = prices
        .map((p) => p.productId)
        .filter((id): id is string => id !== null);
      const known = offIds.length
        ? await db
            .select({ id: product.id, barcode: product.barcode, offId: product.externalIds })
            .from(product)
            .where(inArray(product.barcode, offIds))
        : [];
      const byOff = new Map<string, string>();
      for (const k of known) {
        if (k.barcode) byOff.set(k.barcode, k.id);
        if (k.offId?.off) byOff.set(k.offId.off, k.id);
      }

      // Already-imported price ids (dedupe across runs).
      const existing = await db
        .select({ openpricesId: priceObservation.openpricesId })
        .from(priceObservation)
        .where(eq(priceObservation.storeId, s.id));
      const existingIds = new Set(existing.map((e) => e.openpricesId).filter(Boolean) as string[]);

      for (const p of prices) {
        if (existingIds.has(String(p.priceId)) || p.productId === null) continue;
        const productId = byOff.get(p.productId);
        if (!productId) {
          result.unmatchedProducts += 1;
          continue;
        }
        await db.insert(priceObservation).values({
          productId,
          storeId: s.id,
          amountCents: p.amountCents,
          currency: p.currency,
          priceBasis: "unit",
          observedAt: p.date ? new Date(`${p.date}T12:00:00Z`) : new Date(),
          source: "openprices",
          openpricesId: String(p.priceId),
          discounted: p.discounted,
          regularAmountCents: p.regularAmountCents,
        });
        result.observationsImported += 1;
      }
    }

    await finishRun(
      run.id,
      warnings.length === 0 ? "succeeded" : "partial",
      result,
      warnings,
    );
    return result;
  } catch (err) {
    await db
      .update(ingestionRun)
      .set({ status: "failed", finishedAt: new Date(), error: err instanceof Error ? err.message : String(err), warnings })
      .where(eq(ingestionRun.id, run.id));
    throw err;
  }
}

async function finishRun(runId: string, status: "succeeded" | "partial", result: SyncResult, warnings: string[]) {
  await db
    .update(ingestionRun)
    .set({
      status,
      finishedAt: new Date(),
      stats: {
        storesConsidered: result.storesConsidered,
        storesMatched: result.storesMatched,
        pricesSeen: result.pricesSeen,
        imported: result.observationsImported,
        unmatchedProducts: result.unmatchedProducts,
      },
      warnings,
    })
    .where(eq(ingestionRun.id, runId));
}
