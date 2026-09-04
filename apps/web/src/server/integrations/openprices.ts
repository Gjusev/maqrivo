/**
 * Open Prices client (reads, anonymous; ODbL). Price backbone for enabled
 * stores — matched by OSM node id via the locations/nearby endpoint.
 * Observations keep their own timestamps; freshness policy = 30 days.
 */
import { z } from "zod";
import { politeFetchJson } from "./http";

const OPENPRICES = "https://prices.openfoodfacts.org/api/v1";

const nearbyLocation = z.object({
  location_id: z.number(),
  osm_node_id: z.number().optional(),
  osm_way_id: z.number().optional(),
  name: z.string().optional(),
});

export const nearbyResponse = z.object({ items: z.array(nearbyLocation).optional() });

const priceItem = z.object({
  price_id: z.number(),
  product_id: z.string().optional().nullable(),
  price: z.number(),
  currency: z.string().optional(),
  date: z.string().optional(),
  price_is_discounted: z.boolean().optional(),
  price_without_discount: z.number().nullable().optional(),
  location_id: z.number(),
  owner: z.string().optional(),
});

export const pricesResponse = z.object({ items: z.array(priceItem).optional(), count: z.number().optional() });

export interface OpenPricesStoreMatch {
  locationId: number;
  osmNodeId: number | null;
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
  return (parsed.data.items ?? []).map((l) => ({
    locationId: l.location_id,
    osmNodeId: l.osm_node_id ?? null,
    name: l.name ?? null,
  }));
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
  return (parsed.data.items ?? [])
    .filter((p) => p.product_id && p.price > 0)
    .map((p) => ({
      priceId: p.price_id,
      productId: String(p.product_id),
      amountCents: Math.round(p.price * 100),
      currency: p.currency ?? "EUR",
      date: p.date ?? null,
      discounted: p.price_is_discounted ?? false,
      regularAmountCents: p.price_without_discount != null ? Math.round(p.price_without_discount * 100) : null,
    }));
}
