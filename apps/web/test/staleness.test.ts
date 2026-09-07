import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Plan 013: staleness threshold + opt-in auto-refresh wiring. The DB-backed
 * computation is exercised manually (backdated plan in dev); here the pure
 * threshold is real and the schedule/opt-in wiring is guarded at the source
 * level (pantry-loop.test.ts pattern).
 */

// The module graph reaches server/db, which requires DATABASE_URL at import
// time. The pg pool connects lazily and nothing here queries, so a
// placeholder is enough to import the pure pieces.
process.env.DATABASE_URL ??= "postgres://maqrivo:maqrivo@localhost:5432/maqrivo";
const { STALENESS_THRESHOLD, isStale } = await import("../src/server/optimization/staleness");

const QUEUE = readFileSync(new URL("../src/server/jobs/queue.ts", import.meta.url), "utf8");
const NUTRITION_FORM = readFileSync(
  new URL("../src/app/[locale]/(app)/profile/nutrition-form.tsx", import.meta.url),
  "utf8",
);

describe("isStale (combined-changed-facts threshold)", () => {
  it("keeps the threshold a named, deliberate constant", () => {
    expect(STALENESS_THRESHOLD).toBe(5);
  });

  it("four changed facts → fresh", () => {
    expect(isStale(4, 0)).toBe(false);
    expect(isStale(3, 1)).toBe(false);
    expect(isStale(0, 4)).toBe(false);
  });

  it("five changed facts → stale (prices and promotions sum)", () => {
    expect(isStale(5, 0)).toBe(true);
    expect(isStale(2, 3)).toBe(true);
    expect(isStale(0, 5)).toBe(true);
  });

  it("more than five → stale", () => {
    expect(isStale(4, 2)).toBe(true);
    expect(isStale(11, 30)).toBe(true);
  });
});

describe("plan 013 wiring (source drift guards)", () => {
  it("auto-refresh is scheduled Sundays 07:19, after the week's final ingestion", () => {
    expect(QUEUE).toContain("19 7 * * 0");
  });

  it("the opt-in flag survives refactors of the nutrition form", () => {
    expect(NUTRITION_FORM).toContain("autoRefreshPlan");
  });
});
