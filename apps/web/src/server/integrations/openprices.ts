/**
 * Open Prices client (reads, anonymous; ODbL). Price backbone for enabled
 * stores — matched by OSM node id via the locations/nearby endpoint.
 * Observations keep their own timestamps; freshness policy = 30 days.
 */
import { z } from "zod";
import { politeFetchJson } from "./http";

const OPENPRICES = "https://prices.openfoodfacts.org/api/v1";

const nearbyLocation = z
  .object({
    // Current API fields.
    id: z.number().optional(),
    osm_id: z.number().nullable().optional(),
    osm_type: z.enum(["NODE", "WAY", "RELATION"]).nullable().optional(),
    osm_name: z.string().nullable().optional(),
    // Legacy fields retained during the API transition.
    location_id: z.number().optional(),
    osm_node_id: z.number().optional(),
    osm_way_id: z.number().optional(),
    osm_relation_id: z.number().optional(),
    name: z.string().optional(),
  })
  .loose();

export const nearbyResponse = z.object({ items: z.array(nearbyLocation).optional() });

const priceItem = z
  .object({
    id: z.number().optional(),
    price_id: z.number().optional(),
    product_code: z.string().optional().nullable(),
    product_id: z.union([z.string(), z.number()]).optional().nullable(),
    price: z.number(),
    currency: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
    price_is_discounted: z.boolean().optional(),
    price_without_discount: z.number().nullable().optional(),
    location_id: z.number().optional(),
    owner: z.string().nullable().optional(),
  })
  .loose();

export const pricesResponse = z.object({ items: z.array(priceItem).optional(), count: z.number().optional() });

export interface OpenPricesStoreMatch {
  locationId: number;
  osmId: number | null;
  osmType: "NODE" | "WAY" | "RELATION" | null;
  name: string | null;
}

export async function findOpenPricesLocations(
  center: { lat: number; lng: number },
  radiusKm: number,
): Promise<OpenPricesStoreMatch[]> {
  const url = `${OPENPRICES}/locations/nearby?lat=${center.lat}&lon=${center.lng}&radius_km=${radiusKm}`;
  const json = await politeFetchJson<unknown>(url, { source: "openprices" });
  const parsed = nearbyResponse.safeParse(json);
  if (!parsed.success) return [];
  return (parsed.data.items ?? []).flatMap((location) => {
    const locationId = location.id ?? location.location_id;
    if (locationId === undefined) return [];
    const legacyReference = location.osm_node_id !== undefined
      ? { osmId: location.osm_node_id, osmType: "NODE" as const }
      : location.osm_way_id !== undefined
        ? { osmId: location.osm_way_id, osmType: "WAY" as const }
        : location.osm_relation_id !== undefined
          ? { osmId: location.osm_relation_id, osmType: "RELATION" as const }
          : { osmId: null, osmType: null };
    return [{
      locationId,
      osmId: location.osm_id ?? legacyReference.osmId,
      osmType: location.osm_type ?? legacyReference.osmType,
      name: location.osm_name ?? location.name ?? null,
    }];
  });
}

export interface OpenPricesPrice {
  priceId: number;
  productId: string | null; // OFF product id (usually the EAN)
  amountCents: number;
  currency: string;
  date: string | null;
  discounted: boolean;
  regularAmountCents: number | null;
}

export async function fetchOpenPricesAtLocation(locationId: number, page = 1): Promise<OpenPricesPrice[]> {
  const url = `${OPENPRICES}/prices?location_id=${locationId}&page=${page}&size=100`;
  const json = await politeFetchJson<unknown>(url, { source: "openprices" });
  const parsed = pricesResponse.safeParse(json);
  if (!parsed.success) return [];
  return (parsed.data.items ?? []).flatMap((price) => {
      const priceId = price.id ?? price.price_id;
      const productId = price.product_code ??
        (typeof price.product_id === "string" ? price.product_id : null);
      if (priceId === undefined || !productId || price.price <= 0) return [];
      return [{
      priceId,
      productId,
      amountCents: Math.round(price.price * 100),
      currency: price.currency ?? "EUR",
      date: price.date ?? null,
      discounted: price.price_is_discounted ?? false,
      regularAmountCents:
        price.price_without_discount != null
          ? Math.round(price.price_without_discount * 100)
          : null,
    }];
  });
}
