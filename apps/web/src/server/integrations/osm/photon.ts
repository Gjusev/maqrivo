/**
 * Photon geocoding (komoot): address autocomplete + reverse. Server-side
 * proxy only — the browser never calls Photon directly.
 */
import { z } from "zod";
import { politeFetchJson } from "../http";

const photonFeature = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    name: z.string().optional(),
    street: z.string().optional(),
    housenumber: z.string().optional(),
    postcode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    countrycode: z.string().optional(),
  }),
});

const photonResponse = z.object({ features: z.array(photonFeature) });

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

function labelOf(p: z.infer<typeof photonFeature>["properties"]): string {
  return [p.housenumber, p.street, p.postcode, p.city].filter(Boolean).join(" ") || p.name || "";
}

export async function geocode(query: string, endpoint: string, bias?: { lat: number; lng: number }): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query, lang: "fr", limit: "6" });
  if (bias) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lng));
  }
  const json = await politeFetchJson<unknown>(`${endpoint}?${params}`, { source: "photon" });
  const parsed = photonResponse.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.features
    .map((f) => ({
      label: labelOf(f.properties),
      lat: f.geometry.coordinates[1]!,
      lng: f.geometry.coordinates[0]!,
    }))
    .filter((r) => r.label.length > 0);
}

export async function reverseGeocode(lat: number, lng: number, endpoint: string): Promise<string | null> {
  const json = await politeFetchJson<unknown>(
    `${endpoint}/reverse?lat=${lat}&lon=${lng}&lang=fr&limit=1`,
    { source: "photon" },
  );
  const parsed = photonResponse.safeParse(json);
  const first = parsed.success ? parsed.data.features[0] : undefined;
  return first ? labelOf(first.properties) || null : null;
}
