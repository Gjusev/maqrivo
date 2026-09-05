/**
 * supermarche.com — free ODbL French supermarket directory (no key).
 * Fallback/complementary store discovery; attribution: données © supermarche.com (ODbL).
 * The API moved off /api (that path now serves HTML docs); records carry a
 * typed OSM identity, which feeds cross-source dedupe and OpenPrices matching.
 */
import { z } from "zod";
import { politeFetchJson } from "./http";

const nearbyResult = z
  .object({
    id: z.string(),
    osm: z.object({ type: z.string(), id: z.number() }).nullable().optional(),
    // Nameless OSM shops exist in the directory; filtered out below.
    name: z.string().nullable().optional(),
    brand: z.string().nullable().optional(),
    shop_type: z.string().nullable().optional(),
    location: z.object({ lat: z.number(), lon: z.number() }),
    address: z
      .object({
        street: z.string().nullable().optional(),
        postcode: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .loose();

const nearbyResponse = z.object({ results: z.array(nearbyResult).optional() });

type NearbyResult = z.infer<typeof nearbyResult>;
type NamedResult = NearbyResult & { name: string };

export interface SupermarcheCandidate {
  name: string;
  retailerSlug: string | null;
  lat: number;
  lng: number;
  address: string | null;
  externalIds: Record<string, string>;
  source: "supermarche";
}

const BRAND_TO_SLUG: Record<string, string> = {
  auchan: "auchan",
  carrefour: "carrefour",
  intermarche: "intermarche",
  lidl: "lidl",
  "e.leclerc": "leclerc",
  monoprix: "monoprix",
  franprix: "franprix",
  g20: "g20",
};

/** "Carrefour City" → carrefour; exact banner match first, banner word second. */
function slugForBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  const lower = brand.toLowerCase();
  if (BRAND_TO_SLUG[lower]) return BRAND_TO_SLUG[lower]!;
  const first = lower.split(/\s+/)[0] ?? "";
  return BRAND_TO_SLUG[first] ?? null;
}

const OSM_ID_KEY: Record<string, string> = {
  node: "osm_node",
  way: "osm_way",
  relation: "osm_relation",
};

export async function discoverStoresSupermarche(
  center: { lat: number; lng: number },
  radiusKm: number,
): Promise<SupermarcheCandidate[]> {
  // The endpoint returns the 20 nearest by default; the grid-snapped
 // discovery center (privacy) shifts that nearest set away from the user's
 // actual shops, so request a wider result window explicitly.
  const url = `https://www.supermarche.com/supermarkets/nearby?lat=${center.lat}&lon=${center.lng}&radius_km=${radiusKm}&limit=100`;
  const json = await politeFetchJson<unknown>(url, { source: "supermarche" });
  const parsed = nearbyResponse.safeParse(json);
  if (!parsed.success) return [];

  return (parsed.data.results ?? [])
    .filter((s): s is NamedResult => typeof s.name === "string" && s.name.length > 0)
    .map((s): SupermarcheCandidate => {
      const externalIds: Record<string, string> = { supermarche: s.id };
      // Typed OSM identity: enables cross-source dedupe and exact OpenPrices
      // location matching without hoping for a name/proximity coincidence.
      const osmKind = s.osm ? OSM_ID_KEY[s.osm.type.toLowerCase()] : undefined;
      if (s.osm && osmKind) externalIds[osmKind] = String(s.osm.id);
      return {
        name: s.name,
        retailerSlug: slugForBrand(s.brand),
        lat: s.location.lat,
        lng: s.location.lon,
        address:
          [s.address?.street, s.address?.postcode, s.address?.city].filter(Boolean).join(" ") || null,
        externalIds,
        source: "supermarche",
      };
    });
}
