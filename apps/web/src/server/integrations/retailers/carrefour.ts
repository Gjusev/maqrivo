/**
 * Carrefour adapter — official store data via the verified public
 * eligibility API (no auth; docs/research/french-retailers.md). The endpoint
 * returns store identity, banner and rich opening hours but NO coordinates,
 * so this adapter enriches OSM-located stores rather than placing pins.
 * Catalogue endpoints stay behind CARREFOUR_CATALOGUE_ENABLED (ADR-0005).
 */
import { z } from "zod";
import { IntegrationError, politeFetchJson } from "../http";

const eligibilityResponse = z.object({
  data: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      ref: z.union([z.string(), z.number()]).optional(),
      name: z.string(),
      banner: z.string().optional(),
      openingWeekPattern: z.record(z.string(), z.unknown()).optional(),
      exceptionCalendars: z.array(z.unknown()).optional(),
    }),
  ),
});

export interface CarrefourStoreRecord {
  id: string;
  ref: string | null;
  name: string;
  banner: string | null;
  openingHours: Record<string, unknown> | null;
}

const BANNER_FORMAT: Record<string, string> = {
  HYPER: "hypermarket",
  MARKET: "market",
  CITY: "city",
  EXPRESS: "express",
  CONTACT: "contact",
  DRIVE: "drive",
};

export function bannerToFormat(banner: string | undefined | null): string | null {
  if (!banner) return null;
  return BANNER_FORMAT[banner.toUpperCase()] ?? null;
}

export async function fetchCarrefourStores(input: {
  center: { lat: number; lng: number };
  postalCode: string;
  city: string;
}): Promise<CarrefourStoreRecord[]> {
  const params = new URLSearchParams({
    latitude: String(input.center.lat),
    longitude: String(input.center.lng),
    postalCode: input.postalCode,
    city: input.city,
    page: "1",
    limit: "20",
  });
  const json = await politeFetchJson<unknown>(
    `https://www.carrefour.fr/api/eligibility/drive?${params}`,
    { source: "carrefour", headers: { "x-requested-with": "XMLHttpRequest" } },
  );
  const parsed = eligibilityResponse.safeParse(json);
  if (!parsed.success) {
    throw new IntegrationError("carrefour", "parse", parsed.error.message.slice(0, 200));
  }
  return parsed.data.data.map((s) => ({
    id: String(s.id),
    ref: s.ref !== undefined ? String(s.ref) : null,
    name: s.name,
    banner: s.banner ?? null,
    openingHours: s.openingWeekPattern ?? null,
  }));
}
