/**
 * Overpass store discovery (server-side only; the query center is always
 * grid-snapped before this module sees it). One query per discovery run,
 * results cached by the caller.
 */
import { z } from "zod";
import { IntegrationError, politeFetchJson } from "../http";

const overpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const overpassResponse = z.object({
  elements: z.array(overpassElement),
});

export interface DiscoveredStoreCandidate {
  name: string;
  retailerSlug: string | null; // resolved chain, null for independents
  format: string | null;
  lat: number;
  lng: number;
  address: string | null;
  openingHours: Record<string, string> | null; // OSM opening_hours string kept raw
  externalIds: Record<string, string>;
  source: "osm";
  tags: string[];
}

/** French enseignes → retailer slugs (seeded) + OSM brand matching hints. */
const CHAIN_BRANDS: { slug: string; patterns: RegExp }[] = [
  { slug: "carrefour", patterns: /^(carrefour|carrefour city|carrefour market|carrefour express|carrefour contact|carrefour bio)$/i },
  { slug: "intermarche", patterns: /^(intermarch|intermarché|intermarche super|intermarche express)$/i },
  { slug: "lidl", patterns: /^lidl$/i },
  { slug: "leclerc", patterns: /^(e\.?leclerc|leclerc drive|leclerc express)$/i },
  { slug: "monoprix", patterns: /^monoprix$/i },
  { slug: "franprix", patterns: /^franprix$/i },
  { slug: "g20", patterns: /^g20$/i },
];

function classifyStore(tags: Record<string, string>): { slug: string | null; format: string | null } {
  const shop = tags["shop"] ?? "";
  const brand = tags["brand"] ?? tags["name"] ?? "";
  const slug = CHAIN_BRANDS.find((c) => c.patterns.test(brand.trim()))?.slug ?? null;

  let format: string | null = null;
  if (slug === "carrefour") {
    const b = brand.toLowerCase();
    format = b.includes("city") ? "city" : b.includes("market") ? "market" : b.includes("express") ? "express" : b.includes("contact") ? "contact" : "supermarket";
  } else if (shop === "butcher" || /boucher/i.test(brand)) {
    format = "butcher";
  } else if (shop === "bakery") {
    format = "bakery";
  } else if (shop === "greengrocer") {
    format = "vegetables";
  } else if (shop === "supermarket" || shop === "convenience" || slug !== null) {
    format = shop === "convenience" ? "express" : "supermarket";
  }
  return { slug, format };
}

function tagsToList(tags: Record<string, string>): string[] {
  const list: string[] = [];
  if (tags["diet:halal"] === "yes" || tags["halal"] === "yes") list.push("halal");
  if (tags["organic"] === "only" || tags["organic"] === "yes") list.push("organic");
  if (tags["shop"] === "bulk") list.push("bulk");
  return list;
}

function buildQuery(lat: number, lng: number, radiusM: number): string {
  // Supermarkets/convenience + food specialty shops worth discovering.
  return `[out:json][timeout:25];
nwr["shop"~"supermarket|convenience|butcher|bakery|greengrocer"](around:${radiusM},${lat},${lng});
out center tags 200;`;
}

export async function discoverStoresOverpass(
  center: { lat: number; lng: number }, // MUST be grid-snapped by the caller
  radiusM: number,
  endpoint: string,
): Promise<DiscoveredStoreCandidate[]> {
  const url = `${endpoint}?data=${encodeURIComponent(buildQuery(center.lat, center.lng, radiusM))}`;
  const json = await politeFetchJson<unknown>(url, { source: "overpass" });
  const parsed = overpassResponse.safeParse(json);
  if (!parsed.success) {
    throw new IntegrationError("overpass", "parse", parsed.error.message.slice(0, 200));
  }

  const candidates: DiscoveredStoreCandidate[] = [];
  for (const el of parsed.data.elements) {
    const tags = el.tags ?? {};
    const name = tags["name"];
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lng === undefined) continue;
    const { slug, format } = classifyStore(tags);
    const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:postcode"], tags["addr:city"]].filter(
      (p): p is string => Boolean(p),
    );
    candidates.push({
      name,
      retailerSlug: slug,
      format,
      lat,
      lng,
      address: addressParts.length > 0 ? addressParts.join(" ") : null,
      openingHours: tags["opening_hours"] ? { osm: tags["opening_hours"] } : null,
      externalIds: { osm_node: String(el.id) },
      source: "osm",
      tags: tagsToList(tags),
    });
  }
  return candidates;
}
