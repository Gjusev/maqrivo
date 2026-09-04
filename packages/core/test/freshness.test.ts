import { describe, expect, it } from "vitest";
import { daysBetween, freshnessOf, FRESHNESS_POLICIES, isTrustworthyForMetrics } from "../src/freshness/policies";

const DAY = 86_400_000;

describe("freshness policies", () => {
  it("per-source windows differ — no global TTL", () => {
    expect(FRESHNESS_POLICIES.user.freshDays).toBe(14);
    expect(FRESHNESS_POLICIES.openprices.freshDays).toBe(30);
    expect(FRESHNESS_POLICIES.retailer.freshDays).toBe(7);
  });

  it("today's butcher observation is fresh", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const f = freshnessOf(new Date(now.getTime() - 2 * 3600_000), "user", now);
    expect(f.state).toBe("fresh");
    expect(f.ageDays).toBe(0);
    expect(isTrustworthyForMetrics(f)).toBe(true);
  });

  it("a 20-day-old user observation is stale", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const f = freshnessOf(new Date(now.getTime() - 20 * DAY), "user", now);
    expect(f.state).toBe("stale");
    expect(f.ageDays).toBe(20);
    expect(isTrustworthyForMetrics(f)).toBe(false);
  });

  it("a 20-day-old Open Prices observation is still fresh (30-day policy)", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const f = freshnessOf(new Date(now.getTime() - 20 * DAY), "openprices", now);
    expect(f.state).toBe("fresh");
  });

  it("a 10-day-old retailer price is stale (7-day policy)", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const f = freshnessOf(new Date(now.getTime() - 10 * DAY), "retailer", now);
    expect(f.state).toBe("stale");
  });

  it("daysBetween floors partial days and never goes negative", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(daysBetween(new Date(now.getTime() - 36 * 3600_000), now)).toBe(1);
    expect(daysBetween(new Date(now.getTime() + DAY), now)).toBe(0);
  });
});
