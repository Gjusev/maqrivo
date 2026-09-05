/**
 * Geographic helpers. Distances matter to the optimizer (travel penalty);
 * grid-snap matters to privacy (home coordinates never leave the server
 * unsnapped). Pure math, deterministic.
 */
import { normalizeName } from "../matching/normalize";

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean Earth radius

/** Haversine great-circle distance in metres. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLng * sinLng;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

/**
 * Snap coordinates to the centre of a grid of ~granularityM metres.
 * The snapped point is what external geo services see; the precise point
 * stays in the database.
 */
export function snapToGrid(
  point: { lat: number; lng: number },
  granularityM: number,
): { lat: number; lng: number } {
  if (granularityM <= 0) throw new Error(`granularity must be positive, got ${String(granularityM)}`);
  const step = granularityM / 111_320; // metres per degree latitude
  return {
    lat: Math.round(point.lat / step) * step,
    lng: Math.round(point.lng / step) * step,
  };
}

/**
 * Geographically sensible visit order for a small store set: nearest
 * neighbour from home, no fancy TSP (route optimization stays out of scope).
 */
export function orderStoresByProximity<T extends { lat: number; lng: number }>(
  home: { lat: number; lng: number },
  stores: readonly T[],
): T[] {
  const remaining = [...stores];
  const ordered: T[] = [];
  let cursor = home;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      if (!candidate) continue;
      const d = distanceMeters(cursor, candidate);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0];
    if (!next) break;
    ordered.push(next);
    cursor = next;
  }
  return ordered;
}

export interface LocationCandidate {
  /** Stable unique key of the external location, e.g. "WAY:712015104". */
  readonly key: string;
  readonly name: string | null;
  readonly lat: number | null;
  readonly lon: number | null;
}

/**
 * Fallback store-location match for external price sources: the same shop is
 * often mapped as different OSM elements (a node for the entrance, a way for
 * the building), so exact identity matching misses real prices. Require
 * normalized-name EQUALITY (never fuzzy) inside a tight radius and prefer the
 * nearest candidate — UNRESOLVED stays preferable to a wrong match.
 */
export function matchStoreLocation(
  store: { name: string; lat: number; lng: number },
  candidates: readonly LocationCandidate[],
  maxMeters = 150,
): LocationCandidate | null {
  const wanted = normalizeName(store.name);
  if (!wanted) return null;
  let best: LocationCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.name || candidate.lat == null || candidate.lon == null) continue;
    if (normalizeName(candidate.name) !== wanted) continue;
    const d = distanceMeters(store, { lat: candidate.lat, lng: candidate.lon });
    if (d > maxMeters) continue;
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}
