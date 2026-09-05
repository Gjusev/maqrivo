/**
 * Flipbook contract: how a retailer's leaflet catalogue is discovered and
 * ingested. Two modes, declared by the adapter's data:
 * - structured items (prices/EAN straight from the retailer payload) →
 *   promotions without any AI involvement;
 * - page image URLs only → the pages enter the user-confirmed vision
 *   pipeline exactly like photo uploads.
 * Concrete adapters (verified public endpoints only, ADR-0005) register
 * here; the catalogue-sync job composes runs from what is registered —
 * capability detection, not fake implementations.
 */

/** One deal zone extracted from the retailer's own structured data. */
export interface RemoteCatalogueItem {
  readonly ean: string | null;
  readonly label: string;
  readonly brand: string | null;
  /** Current/promo price in cents, when the payload carries one. */
  readonly priceCents: number | null;
  /** Crossed-out regular price in cents. */
  readonly regularPriceCents: number | null;
  /** Per-kg price in cents (weight-sold items). */
  readonly pricePerKgCents: number | null;
  readonly packaging: string | null;
  readonly category: string | null;
  /** Loyalty-card offer (maps to LOYALTY_PRICE + loyaltyRequired). */
  readonly loyalty: boolean;
  /** Per-offer validity text printed with the deal. */
  readonly validityText: string | null;
  /** Typed terms when the retailer exposes a conditional promotion. */
  readonly mechanism?:
    | "PROMO_PRICE"
    | "PERCENTAGE_OFF"
    | "MULTIBUY"
    | "BUY_X_GET_Y"
    | "SECOND_UNIT_DISCOUNT"
    | "LOYALTY_PRICE"
    | "LOYALTY_CREDIT";
  readonly minQty?: number | null;
  readonly payQty?: number | null;
  readonly getQty?: number | null;
  readonly discountPct?: number | null;
  readonly conditionsRaw?: string | null;
  /** 1-based leaflet page the deal appears on (provenance). */
  readonly page: number | null;
}

export interface RemoteCatalogue {
  /** Retailer-stable identifier (unique with the retailer). */
  readonly externalId: string;
  readonly title: string | null;
  /** ISO dates YYYY-MM-DD. */
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  /** Human-viewable official page used as fallback evidence for items. */
  readonly sourceUrl?: string | null;
  /** Page image URLs, in leaflet order (vision mode). */
  readonly pageImageUrls: readonly string[];
  /** Structured deals (items mode) — when present, pages are not fetched. */
  readonly items: readonly RemoteCatalogueItem[];
}

/**
 * Fetch the current catalogues. storeRef is the retailer's own store
 * reference (e.g. Intermarché PDV code) for store-keyed sources; national
 * sources receive null.
 */
export type FlipbookSource = (storeRef: string | null) => Promise<RemoteCatalogue[]>;

export interface FlipbookRegistration {
  readonly source: FlipbookSource;
  /**
   * true: runs once per enabled store carrying externalIds[slug].
   * false (national): runs once per run when any store of that retailer
   * is enabled — the two-tier politeness gate still applies.
   */
  readonly storeKeyed: boolean;
}

/** slug → registration. Registered by concrete adapters at module load. */
const REGISTRY = new Map<string, FlipbookRegistration>();

export function registerFlipbook(retailerSlug: string, registration: FlipbookRegistration): void {
  REGISTRY.set(retailerSlug, registration);
}

export function flipbookRegistrations(): ReadonlyMap<string, FlipbookRegistration> {
  return REGISTRY;
}
