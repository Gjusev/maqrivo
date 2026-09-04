/**
 * supermarche.com — free ODbL French supermarket directory (no key).
 * Fallback/complementary store discovery; attribution: données © supermarche.com (ODbL).
 */
import { z } from "zod";
import { politeFetchJson } from "./http";

const nearbyResponse = z.object({
  supermarkets: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string().optional(),
        lat: z.number(),
        lng: z.number(),
        address: z.string().optional(),
        zip_code: z.string().optional(),
        city: z.string().optional(),
        id: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional(),
});

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
  carrefour: "carrefour",
  intermarche: "intermarche",
  lidl: "lidl",
  "e.leclerc": "leclerc",
  monoprix: "monoprix",
  franprix: "franprix",
  g20: "g20",
};

export async function discoverStoresSupermarche(
  center: { lat: number; lng: number },
  radiusKm: number,
): Promise<SupermarcheCandidate[]> {
  const url = `https://www.supermarche.com/api/supermarkets/nearby?lat=${center.lat}&lon=${center.lng}&radius_km=${radiusKm}`;
  const json = await politeFetchJson<unknown>(url, { source: "supermarche" });
  const parsed = nearbyResponse.safeParse(json);
  if (!parsed.success) return [];

  return (parsed.data.supermarkets ?? [])
    .filter((s) => s.name)
    .map((s): SupermarcheCandidate => ({
      name: s.name,
      retailerSlug: s.brand ? (BRAND_TO_SLUG[s.brand.toLowerCase()] ?? null) : null,
      lat: s.lat,
      lng: s.lng,
      address: [s.address, s.zip_code, s.city].filter(Boolean).join(" ") || null,
      externalIds: s.id !== undefined ? { supermarche: String(s.id) } : {},
      source: "supermarche",
    }));
}
