/**
 * Flipbook contract: how a retailer's leaflet catalogue is discovered and
 * downloaded. Concrete adapters (verified public endpoints only, ADR-0005)
 * implement a FlipbookSource and register it here; the catalogue-sync job
 * composes runs from what is registered — capability detection, not fake
 * implementations.
 */

export interface RemoteCatalogue {
  /** Retailer-stable identifier (unique with the retailer). */
  readonly externalId: string;
  readonly title: string | null;
  /** ISO dates YYYY-MM-DD. */
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  /** Page image URLs, in leaflet order. */
  readonly pageImageUrls: readonly string[];
}

/** Fetch the current catalogues for one store of this retailer. */
export type FlipbookSource = (storeRef: string) => Promise<RemoteCatalogue[]>;

/** slug → source. Registered by concrete adapters at module load. */
const FLIPBOOK_SOURCES = new Map<string, FlipbookSource>();

export function registerFlipbookSource(retailerSlug: string, source: FlipbookSource): void {
  FLIPBOOK_SOURCES.set(retailerSlug, source);
}

export function flipbookSourceFor(retailerSlug: string): FlipbookSource | undefined {
  return FLIPBOOK_SOURCES.get(retailerSlug);
}
