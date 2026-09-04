/**
 * Freshness: the visible age of an observation. Source-dependent policies —
 * there is no single global TTL. Old observations are never presented as
 * current; unknown prices stay unknown.
 */

export type PriceSource =
  | "user"
  | "openprices"
  | "retailer"
  | "catalogue"
  | "receipt"
  | "manual";

export interface FreshnessPolicy {
  /** Days an observation from this source counts as fresh. */
  readonly freshDays: number;
}

export const FRESHNESS_POLICIES: Record<PriceSource, FreshnessPolicy> = {
  user: { freshDays: 14 },
  openprices: { freshDays: 30 },
  retailer: { freshDays: 7 },
  catalogue: { freshDays: 7 }, // re-anchored by catalogue validity windows
  receipt: { freshDays: 30 },
  manual: { freshDays: 14 },
};

export type FreshnessState = "fresh" | "stale";

export interface Freshness {
  readonly state: FreshnessState;
  readonly ageDays: number;
  readonly source: PriceSource;
}

/** Whole days between observation and now (floor). */
export function daysBetween(observedAt: Date, now: Date): number {
  const ms = now.getTime() - observedAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function freshnessOf(observedAt: Date, source: PriceSource, now: Date): Freshness {
  const ageDays = daysBetween(observedAt, now);
  return {
    state: ageDays < FRESHNESS_POLICIES[source].freshDays ? "fresh" : "stale",
    ageDays,
    source,
  };
}

/** Deterministic metrics gate: protein-per-euro etc. only on fresh prices. */
export function isTrustworthyForMetrics(f: Freshness): boolean {
  return f.state === "fresh";
}
