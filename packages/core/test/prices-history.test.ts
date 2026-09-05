import { describe, expect, it } from "vitest";
import {
  assessDeal,
  assessLatestPrice,
  priceTrend,
  summarizePriceHistory,
  type PricePoint,
} from "../src/prices/history";

const DAY = 86_400_000;
function pt(day: number, amountCents: number, discounted = false): PricePoint {
  return { observedAt: day * DAY, amountCents, discounted };
}

describe("summarizePriceHistory", () => {
  it("returns null on empty history — no data, no stats", () => {
    expect(summarizePriceHistory([])).toBeNull();
  });

  it("summarizes a single observation", () => {
    const s = summarizePriceHistory([pt(0, 499)]);
    expect(s).not.toBeNull();
    expect(s!.count).toBe(1);
    expect(s!.latestCents).toBe(499);
    expect(s!.previousCents).toBeNull();
    expect(s!.lowestCents).toBe(499);
    expect(s!.highestCents).toBe(499);
    expect(s!.averageCents).toBe(499);
  });

  it("sorts unsorted input chronologically", () => {
    const s = summarizePriceHistory([pt(10, 599), pt(0, 499), pt(5, 549)]);
    expect(s!.latestCents).toBe(599);
    expect(s!.previousCents).toBe(549);
    expect(s!.firstAt).toBe(0);
    expect(s!.lastAt).toBe(10 * DAY);
  });

  it("breaks timestamp ties on the lower amount — deterministic", () => {
    const a = summarizePriceHistory([pt(3, 549), pt(3, 499)]);
    const b = summarizePriceHistory([pt(3, 499), pt(3, 549)]);
    expect(a).toEqual(b);
    expect(a!.latestCents).toBe(549);
  });

  it("averages with rounding and anchors lowest/highest", () => {
    const s = summarizePriceHistory([pt(0, 400), pt(1, 500), pt(2, 600)]);
    expect(s!.averageCents).toBe(500);
    expect(s!.lowestCents).toBe(400);
    expect(s!.lowestAt).toBe(0);
    expect(s!.highestCents).toBe(600);
  });

  it("average rounds half up on exact .5", () => {
    const s = summarizePriceHistory([pt(0, 100), pt(1, 101)]);
    expect(s!.averageCents).toBe(Math.round(100.5));
  });
});

describe("priceTrend", () => {
  it("is null with a single observation", () => {
    expect(priceTrend(summarizePriceHistory([pt(0, 499)])!)).toBeNull();
  });

  it("FLAT within one cent — noise is not a trend", () => {
    expect(priceTrend(summarizePriceHistory([pt(0, 499), pt(1, 500)])!)).toBe("FLAT");
    expect(priceTrend(summarizePriceHistory([pt(0, 500), pt(1, 500)])!)).toBe("FLAT");
  });

  it("UP and DOWN beyond one cent", () => {
    expect(priceTrend(summarizePriceHistory([pt(0, 499), pt(1, 599)])!)).toBe("UP");
    expect(priceTrend(summarizePriceHistory([pt(0, 599), pt(1, 499)])!)).toBe("DOWN");
  });
});

describe("assessDeal", () => {
  it("NO_HISTORY without observations", () => {
    const a = assessDeal(499, []);
    expect(a.quality).toBe("NO_HISTORY");
    expect(a.cheaperThanShare).toBeNull();
  });

  it("INSUFFICIENT below three observations — thin data gets no label", () => {
    expect(assessDeal(300, [pt(0, 499), pt(1, 549)]).quality).toBe("INSUFFICIENT");
  });

  it("STABLE when the distribution barely moves", () => {
    // Spread 3 ¢ on a 2 € price = 1.5 % — below the 2 % floor.
    const a = assessDeal(201, [pt(0, 200), pt(1, 203), pt(2, 200)]);
    expect(a.quality).toBe("STABLE");
  });

  it("GOOD_DEAL when cheaper than ≥70 % of observed prices", () => {
    const history = [pt(0, 549), pt(1, 599), pt(2, 649), pt(3, 599), pt(4, 629)];
    const a = assessDeal(499, history);
    expect(a.quality).toBe("GOOD_DEAL");
    expect(a.cheaperThanShare).toBe(1);
    expect(a.sampleSize).toBe(5);
  });

  it("PRICEY when more expensive than ≥75 % of observed prices", () => {
    const history = [pt(0, 299), pt(1, 309), pt(2, 299), pt(3, 305)];
    const a = assessDeal(499, history);
    expect(a.quality).toBe("PRICEY");
    expect(a.pricierThanShare).toBe(1);
  });

  it("TYPICAL in the middle of the distribution", () => {
    const history = [pt(0, 399), pt(1, 599), pt(2, 499), pt(3, 549), pt(4, 449)];
    expect(assessDeal(499, history).quality).toBe("TYPICAL");
  });

  it("counts shares strictly — ties are neither cheaper nor pricier", () => {
    const history = [pt(0, 499), pt(1, 499), pt(2, 499), pt(3, 399)];
    const a = assessDeal(499, history);
    expect(a.cheaperThanShare).toBe(0);
    expect(a.pricierThanShare).toBeCloseTo(0.25);
  });

  it("discounted observations count — they are real prices seen", () => {
    const history = [pt(0, 599, true), pt(1, 599, true), pt(2, 649)];
    expect(assessDeal(599, history).quality).not.toBe("NO_HISTORY");
  });
});

describe("assessLatestPrice", () => {
  it("NO_HISTORY on empty and on a single point — no prior basis at all", () => {
    expect(assessLatestPrice([]).quality).toBe("NO_HISTORY");
    expect(assessLatestPrice([pt(0, 499)]).quality).toBe("NO_HISTORY");
  });

  it("assesses the latest against everything before it — itself excluded", () => {
    // Latest 399 vs prior [499, 549, 599]: cheaper than all → GOOD_DEAL.
    const a = assessLatestPrice([pt(0, 499), pt(1, 549), pt(2, 599), pt(3, 399)]);
    expect(a.quality).toBe("GOOD_DEAL");
    expect(a.sampleSize).toBe(3);
  });

  it("ignores input order — chronology is derived", () => {
    const shuffled = [pt(3, 399), pt(1, 549), pt(0, 499), pt(2, 599)];
    expect(assessLatestPrice(shuffled).quality).toBe("GOOD_DEAL");
  });
});
