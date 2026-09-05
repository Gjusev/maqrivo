/**
 * Store discovery orchestration: grid-snap the center, query open sources in
 * parallel, dedupe, upsert global store rows, and maintain per-user prefs
 * (passive by default — enabling is the user's choice). Failures of any
 * single source are recorded as warnings, never fatal (isolation rule).
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { distanceMeters, snapToGrid } from "@maqrivo/core";
import { db } from "../db";
import { ingestionRun, retailer, store, userStorePrefs, usersProfile } from "@maqrivo/db";
import { discoverStoresOverpass, type DiscoveredStoreCandidate } from "../integrations/osm/overpass";
import { osmReferenceFromExternalIds, osmReferenceKey } from "../integrations/osm/reference";
import { discoverStoresSupermarche } from "../integrations/supermarche";
import { bannerToFormat, fetchCarrefourStores } from "../integrations/retailers/carrefour";
import { reverseGeocode } from "../integrations/osm/photon";
import { normalizeName } from "@maqrivo/core";

export interface DiscoveryResult {
  discovered: number;
  updated: number;
  totalNearby: number;
  warnings: string[];
}

const DEDUPE_RADIUS_M = 150;

export async function runStoreDiscovery(userId: string): Promise<DiscoveryResult> {
  const run = (
    await db.insert(ingestionRun).values({ source: "discovery", kind: "store_refresh", status: "running" }).returning()
  )[0]!;

  const warnings: string[] = [];
  try {
    const profile = (await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1))[0];
    const home = profile?.homeLat != null && profile?.homeLng != null ? { lat: profile.homeLat, lng: profile.homeLng } : null;
    if (!home) throw new Error("no-location");
    const granularity = profile?.locationGranularityM ?? 1500;
    const radiusM = 2500; // fixed discovery radius; user's search radius filters display

    // Privacy: external services see the grid-snapped center only.
    const center = snapToGrid(home, granularity);

    const [overpass, supermarche] = await Promise.allSettled([
      discoverStoresOverpass(center, radiusM, process.env.OVERPASS_ENDPOINT ?? "https://overpass-api.de/api/interpreter"),
      discoverStoresSupermarche(center, radiusM / 1000),
    ]);

    const candidates: (DiscoveredStoreCandidate & { origin: "osm" | "supermarche" })[] = [];
    if (overpass.status === "fulfilled") candidates.push(...overpass.value.map((c) => ({ ...c, origin: "osm" as const })));
    else warnings.push(`overpass: ${overpass.reason instanceof Error ? overpass.reason.message : "failed"}`);
    if (supermarche.status === "fulfilled") {
      for (const s of supermarche.value) {
        candidates.push({
          name: s.name,
          retailerSlug: s.retailerSlug,
          format: null,
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          openingHours: null,
          externalIds: s.externalIds,
          source: "osm",
          tags: [],
          origin: "supermarche",
        });
      }
    } else {
      warnings.push(`supermarche: ${supermarche.reason instanceof Error ? supermarche.reason.message : "failed"}`);
    }

    // Official Carrefour enrichment (best effort): ids + hours by name match.
    const carrefourOfficial = await enrichWithCarrefour(center, warnings);

    // Load retailers for slug→id.
    const retailers = await db.select().from(retailer);
    const retailerBySlug = new Map(retailers.map((r) => [r.slug, r.id]));

    // Fetch existing stores in the bbox for matching.
    const existing = await db
      .select()
      .from(store)
      .where(
        and(
          gte(store.lat, center.lat - 0.05),
          lte(store.lat, center.lat + 0.05),
          gte(store.lng, center.lng - 0.05),
          lte(store.lng, center.lng + 0.05),
        ),
      );

    let discovered = 0;
    let updated = 0;
    const seenKeys = new Set<string>();

    for (const candidate of dedupe(candidates)) {
      const key = candidate.key;
      seenKeys.add(key);
      const retailerId = candidate.retailerSlug ? (retailerBySlug.get(candidate.retailerSlug) ?? null) : null;

      // Enrich Carrefour candidates with official data when uniquely matched.
      let externalIds = candidate.externalIds;
      let openingHours: Record<string, unknown> | null = candidate.openingHours;
      let format = candidate.format;
      if (candidate.retailerSlug === "carrefour" && carrefourOfficial.length > 0) {
        const matches = carrefourOfficial.filter((c) => nameOverlap(c.name, candidate.name));
        if (matches.length === 1) {
          const m = matches[0]!;
          externalIds = { ...externalIds, carrefour: m.id };
          if (m.openingHours) openingHours = m.openingHours;
          format = bannerToFormat(m.banner) ?? format;
        }
      }

      const existingRow = existing.find(
        (s) =>
          (osmReferenceKey(externalIds) !== null &&
            osmReferenceKey(s.externalIds) === osmReferenceKey(externalIds)) ||
          (externalIds.supermarche && s.externalIds?.supermarche === externalIds.supermarche) ||
          (s.retailerId !== null &&
            s.retailerId === retailerId &&
            distanceMeters({ lat: s.lat, lng: s.lng }, candidate) < DEDUPE_RADIUS_M &&
            normalizeName(s.name) === normalizeName(candidate.name)),
      );

      if (existingRow) {
        // Older builds labelled every Overpass element as osm_node. When a
        // fresh typed reference arrives, replace any stale OSM key instead of
        // retaining two contradictory identities on the same store.
        const retainedExternalIds = osmReferenceFromExternalIds(externalIds)
          ? Object.fromEntries(
              Object.entries(existingRow.externalIds ?? {}).filter(
                ([key]) => !["osm_node", "osm_way", "osm_relation"].includes(key),
              ),
            )
          : (existingRow.externalIds ?? {});
        await db
          .update(store)
          .set({
            lastVerifiedAt: new Date(),
            externalIds: { ...retainedExternalIds, ...externalIds },
            updatedAt: new Date(),
          })
          .where(eq(store.id, existingRow.id));
        updated += 1;
      } else {
        await db.insert(store).values({
          retailerId,
          name: candidate.name,
          format,
          address: candidate.address,
          lat: candidate.lat,
          lng: candidate.lng,
          openingHours,
          origin: candidate.origin === "osm" ? "osm" : "supermarche",
          source: "discovery",
          externalIds,
          tags: candidate.tags,
          lastVerifiedAt: new Date(),
        });
        discovered += 1;
      }
    }

    // Maintain per-user prefs with true distance for every nearby store.
    const nearby = await db
      .select({ id: store.id, lat: store.lat, lng: store.lng })
      .from(store)
      .where(
        and(
          gte(store.lat, center.lat - 0.05),
          lte(store.lat, center.lat + 0.05),
          gte(store.lng, center.lng - 0.05),
          lte(store.lng, center.lng + 0.05),
        ),
      );
    let prefsCreated = 0;
    for (const s of nearby) {
      const dist = distanceMeters(home, { lat: s.lat, lng: s.lng });
      if (dist > radiusM) continue;
      const inserted = await db
        .insert(userStorePrefs)
        .values({ userId, storeId: s.id, distanceM: dist })
        .onConflictDoUpdate({
          target: [userStorePrefs.userId, userStorePrefs.storeId],
          set: { distanceM: dist, updatedAt: new Date() },
        })
        .returning({ id: userStorePrefs.id });
      if (inserted.length > 0) prefsCreated += 1;
    }

    const result: DiscoveryResult = {
      discovered,
      updated,
      totalNearby: nearby.length,
      warnings,
    };
    await db
      .update(ingestionRun)
      .set({
        status: warnings.length === 0 ? "succeeded" : "partial",
        finishedAt: new Date(),
        stats: { discovered, updated, prefs: prefsCreated, candidates: candidates.length },
        warnings,
      })
      .where(eq(ingestionRun.id, run.id));
    return result;
  } catch (err) {
    await db
      .update(ingestionRun)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
        warnings,
      })
      .where(eq(ingestionRun.id, run.id));
    throw err;
  }
}

/** Carrefour official records need a postal code + city: reverse-geocode once. */
async function enrichWithCarrefour(
  center: { lat: number; lng: number },
  warnings: string[],
): Promise<{ id: string; name: string; banner: string | null; openingHours: Record<string, unknown> | null }[]> {
  try {
    const photonEndpoint = process.env.PHOTON_ENDPOINT ?? "https://photon.komoot.io/api";
    const label = await reverseGeocode(center.lat, center.lng, photonEndpoint);
    if (!label) return [];
    // Take trailing "##### City" from the reverse label for postal + city.
    const match = /(\d{5})\s+(.+)$/.exec(label);
    const postalCode = match?.[1] ?? "92400";
    const city = match?.[2] ?? "Courbevoie";
    return await fetchCarrefourStores({ center, postalCode, city });
  } catch (err) {
    warnings.push(`carrefour: ${err instanceof Error ? err.message : "failed"}`);
    return [];
  }
}

function nameOverlap(official: string, discovered: string): boolean {
  const a = normalizeName(official);
  const b = normalizeName(discovered);
  return a === b || a.includes(b) || b.includes(a);
}

type DedupedCandidate = DiscoveredStoreCandidate & { origin: "osm" | "supermarche"; key: string };

/** Same-source and cross-source dedupe by external id or (retailer, name, proximity). */
function dedupe(candidates: (DiscoveredStoreCandidate & { origin: "osm" | "supermarche" })[]): DedupedCandidate[] {
  const byExternal = new Map<string, DedupedCandidate>();
  const geoKeys: { c: DedupedCandidate; lat: number; lng: number }[] = [];
  const out: DedupedCandidate[] = [];

  for (const c of candidates) {
    const osmKey = osmReferenceKey(c.externalIds);
    const extKey = osmKey ? `osm:${osmKey}` : c.externalIds.supermarche ? `sm:${c.externalIds.supermarche}` : null;
    if (extKey) {
      const prior = byExternal.get(extKey);
      if (prior) {
        // Merge: prefer osm origin, keep richer fields.
        prior.address = prior.address ?? c.address;
        prior.tags = [...new Set([...prior.tags, ...c.tags])];
        continue;
      }
    }
    const wrapped: DedupedCandidate = { ...c, key: extKey ?? `geo:${normalizeName(c.name)}:${c.retailerSlug ?? "x"}` };
    if (extKey) byExternal.set(extKey, wrapped);

    const near = geoKeys.find(
      (g) => g.c.retailerSlug === c.retailerSlug && distanceMeters({ lat: g.lat, lng: g.lng }, c) < DEDUPE_RADIUS_M && normalizeName(g.c.name) === normalizeName(c.name),
    );
    if (near) continue;
    geoKeys.push({ c: wrapped, lat: c.lat, lng: c.lng });
    out.push(wrapped);
  }
  return out;
}
