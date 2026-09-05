/**
 * Open Prices → price observations sync for enabled stores.
 * Store matching: exact OSM identity first; a tight proximity+name fallback
 * catches the same shop mapped as a different OSM element (node vs way).
 * Only prices for products we already know are imported (barcode/OFF match);
 * unmatched prices are counted, never guessed onto wrong products.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { ingestionRun, priceObservation, product, store, userStorePrefs } from "@maqrivo/db";
import {
  fetchAllOpenPricesAtLocation,
  findOpenPricesLocations,
  type OpenPricesStoreMatch,
} from "../integrations/openprices";
import { matchStoreLocation, snapToGrid } from "@maqrivo/core";
import { osmReferenceFromExternalIds } from "../integrations/osm/reference";

export interface SyncResult {
  storesConsidered: number;
  storesMatched: number;
  /** Subset matched by the proximity+name fallback (no exact OSM identity). */
  storesMatchedProximity: number;
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
    storesMatchedProximity: 0,
    pricesSeen: 0,
    observationsImported: 0,
    unmatchedProducts: 0,
    warnings,
  };

  try {
    // Enabled stores carrying a correctly typed OSM node/way/relation id.
    const enabled = await db
      .select({ store: store })
      .from(userStorePrefs)
      .innerJoin(store, eq(userStorePrefs.storeId, store.id))
      .where(eq(userStorePrefs.enabled, true));
    const osmStores = enabled
      .map((entry) => entry.store)
      .filter((candidate) => osmReferenceFromExternalIds(candidate.externalIds) !== null);

    result.storesConsidered = osmStores.length;
    if (osmStores.length === 0) {
      await finishRun(run.id, "succeeded", result, warnings);
      return result;
    }

    // Location index: one nearby query per ~1.5 km cell (2 km read radius
    // covers every point of the cell). Coordinates are kept for the
    // proximity fallback.
    const seenCells = new Set<string>();
    const locationByOsm = new Map<string, number>();
    const allLocations: OpenPricesStoreMatch[] = [];
    for (const s of osmStores) {
      const center = snapToGrid({ lat: s.lat, lng: s.lng }, 1500);
      const cellKey = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
      if (!seenCells.has(cellKey)) {
        seenCells.add(cellKey);
        try {
          const locations = await findOpenPricesLocations(center, 2);
          allLocations.push(...locations);
          for (const loc of locations) {
            if (loc.osmId != null && loc.osmType) {
              locationByOsm.set(`${loc.osmType}:${String(loc.osmId)}`, loc.locationId);
            }
          }
        } catch (err) {
          warnings.push(`locations/nearby ${cellKey}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
    }
    const claimedLocationIds = new Set<number>();
    const locationByCandidateKey = new Map(
      allLocations.map((l) => [`${l.osmType ?? "?"}:${String(l.osmId ?? "?")}`, l]),
    );

    for (const s of osmStores) {
      const osmReference = osmReferenceFromExternalIds(s.externalIds);
      if (!osmReference) continue;
      let locationId = locationByOsm.get(`${osmReference.type}:${String(osmReference.id)}`) ?? null;
      let matchedByProximity = false;
      if (locationId === null) {
        // Same shop, different OSM element: normalized-name equality within
        // 150 m (never fuzzy), nearest candidate wins, never reuse a location
        // already claimed by an exact match.
        const candidate = matchStoreLocation(
          { name: s.name, lat: s.lat, lng: s.lng },
          allLocations.map((l) => ({
            key: `${l.osmType ?? "?"}:${String(l.osmId ?? "?")}`,
            name: l.name,
            lat: l.lat,
            lon: l.lon,
          })),
        );
        const proximate = candidate ? locationByCandidateKey.get(candidate.key) : undefined;
        if (proximate && !claimedLocationIds.has(proximate.locationId)) {
          locationId = proximate.locationId;
          matchedByProximity = true;
        }
      }
      if (locationId === null || claimedLocationIds.has(locationId)) continue;
      claimedLocationIds.add(locationId);
      result.storesMatched += 1;
      if (matchedByProximity) result.storesMatchedProximity += 1;

      let prices;
      try {
        prices = await fetchAllOpenPricesAtLocation(locationId);
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
        storesMatchedProximity: result.storesMatchedProximity,
        pricesSeen: result.pricesSeen,
        imported: result.observationsImported,
        unmatchedProducts: result.unmatchedProducts,
      },
      warnings,
    })
    .where(eq(ingestionRun.id, runId));
}
