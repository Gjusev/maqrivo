/**
 * Geographic helpers. Distances matter to the optimizer (travel penalty);
 * grid-snap matters to privacy (home coordinates never leave the server
 * unsnapped). Pure math, deterministic.
 */

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
