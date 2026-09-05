/**
 * Price history analytics: pure statistics over observed prices.
 * Deterministic and honest about thin data — a label is only issued when
 * the observed distribution actually supports it. Discounted observations
 * count: they are real prices seen. Observations must share one price
 * basis (a unit price and a per-kg price are not comparable) — grouping
 * by basis is the caller's job.
 */

export interface PricePoint {
  /** Epoch milliseconds. */
  readonly observedAt: number;
  readonly amountCents: number;
  readonly discounted: boolean;
}

export interface PriceHistorySummary {
  readonly count: number;
  readonly latestCents: number;
  /** Second-newest observation, when at least two exist. */
  readonly previousCents: number | null;
  readonly lowestCents: number;
  readonly lowestAt: number;
  readonly highestCents: number;
  readonly averageCents: number;
  readonly firstAt: number;
  readonly lastAt: number;
}

export type PriceTrend = "UP" | "DOWN" | "FLAT";

export type DealQuality =
  | "NO_HISTORY"
  | "INSUFFICIENT"
  | "STABLE"
  | "GOOD_DEAL"
  | "TYPICAL"
  | "PRICEY";

export interface DealAssessment {
  readonly quality: DealQuality;
  /** Share (0..1) of observed prices strictly above the assessed price. */
  readonly cheaperThanShare: number | null;
  /** Share (0..1) of observed prices strictly below the assessed price. */
  readonly pricierThanShare: number | null;
  readonly sampleSize: number;
}

/** Chronological order; same-timestamp ties break on the lower amount. */
function chronological(points: readonly PricePoint[]): PricePoint[] {
  return [...points].sort(
    (a, b) => a.observedAt - b.observedAt || a.amountCents - b.amountCents,
  );
}

export function summarizePriceHistory(points: readonly PricePoint[]): PriceHistorySummary | null {
  if (points.length === 0) return null;
  const ordered = chronological(points);
  const amounts = ordered.map((p) => p.amountCents);
  const sum = amounts.reduce((acc, c) => acc + c, 0);
  const lowestCents = Math.min(...amounts);
  const highestCents = Math.max(...amounts);
  // Earliest occurrence of each extreme — deterministic anchor.
  const lowest = ordered.find((p) => p.amountCents === lowestCents);
  const highest = ordered.find((p) => p.amountCents === highestCents);
  const first = ordered.at(0);
  const last = ordered.at(-1);
  const previous = ordered.length >= 2 ? ordered.at(-2) : undefined;
  if (!lowest || !highest || !first || !last) return null; // unreachable: points non-empty
  return {
    count: ordered.length,
    latestCents: last.amountCents,
    previousCents: previous ? previous.amountCents : null,
    lowestCents,
    lowestAt: lowest.observedAt,
    highestCents,
    averageCents: Math.round(sum / ordered.length),
    firstAt: first.observedAt,
    lastAt: last.observedAt,
  };
}

/** Latest vs previous. A 1-cent move is noise, not a trend. */
export function priceTrend(summary: PriceHistorySummary): PriceTrend | null {
  if (summary.previousCents === null) return null;
  const diff = summary.latestCents - summary.previousCents;
  if (Math.abs(diff) <= 1) return "FLAT";
  return diff > 0 ? "UP" : "DOWN";
}

/** A distribution this flat carries no deal signal — the price just doesn't move. */
function isStableSpread(points: readonly PricePoint[]): boolean {
  const amounts = points.map((p) => p.amountCents);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return max - min <= Math.max(2, Math.round(min * 0.02));
}

/** Assess an external price (e.g. a promotion) against observed history. */
export function assessDeal(currentCents: number, points: readonly PricePoint[]): DealAssessment {
  if (points.length === 0) {
    return { quality: "NO_HISTORY", cheaperThanShare: null, pricierThanShare: null, sampleSize: 0 };
  }
  const cheaper = points.filter((p) => p.amountCents > currentCents).length;
  const pricier = points.filter((p) => p.amountCents < currentCents).length;
  const cheaperThanShare = cheaper / points.length;
  const pricierThanShare = pricier / points.length;
  if (points.length < 3) {
    return { quality: "INSUFFICIENT", cheaperThanShare, pricierThanShare, sampleSize: points.length };
  }
  if (isStableSpread(points)) {
    return { quality: "STABLE", cheaperThanShare, pricierThanShare, sampleSize: points.length };
  }
  const quality: DealQuality =
    cheaperThanShare >= 0.7 ? "GOOD_DEAL" : pricierThanShare >= 0.75 ? "PRICEY" : "TYPICAL";
  return { quality, cheaperThanShare, pricierThanShare, sampleSize: points.length };
}

/**
 * Assess the current (latest) observed price against everything seen
 * before it — the latest point itself is excluded, it is the subject.
 */
export function assessLatestPrice(points: readonly PricePoint[]): DealAssessment {
  if (points.length === 0) {
    return { quality: "NO_HISTORY", cheaperThanShare: null, pricierThanShare: null, sampleSize: 0 };
  }
  const ordered = chronological(points);
  const latest = ordered.at(-1);
  if (!latest) return { quality: "NO_HISTORY", cheaperThanShare: null, pricierThanShare: null, sampleSize: 0 };
  return assessDeal(latest.amountCents, ordered.slice(0, -1));
}
