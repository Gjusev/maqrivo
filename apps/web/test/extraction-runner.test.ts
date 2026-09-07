import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Plan 005: the sweep's retry cadence, kill-switch and wiring. The DB-backed
 * pieces are guarded at the source level (catalogue-sync-branch.test.ts
 * pattern); `shouldAttempt` is pure and exercised for real.
 */

// The runner's module graph reaches server/db, which requires DATABASE_URL at
// import time. The pg pool connects lazily and nothing here queries, so a
// placeholder is enough to import the pure pieces.
process.env.DATABASE_URL ??= "postgres://maqrivo:maqrivo@localhost:5432/maqrivo";
const { shouldAttempt, runExtractionSweep, RETRY_INTERVAL_MS } = await import(
  "../src/server/catalogues/extraction-runner"
);

const HOUR_MS = 60 * 60 * 1000;

describe("shouldAttempt (25h retry cadence)", () => {
  const now = new Date("2026-09-07T06:41:00Z"); // sweep time, 41 6 * * *

  it("never attempted → attempt", () => {
    expect(shouldAttempt(null, false, now)).toBe(true);
  });

  it("latest attempt younger than 25h → cooldown skip", () => {
    expect(shouldAttempt(new Date(now.getTime() - HOUR_MS), false, now)).toBe(false);
    expect(shouldAttempt(new Date(now.getTime() - 24 * HOUR_MS), false, now)).toBe(false);
  });

  it("failed attempt 25h or older → retry", () => {
    expect(shouldAttempt(new Date(now.getTime() - 25 * HOUR_MS), false, now)).toBe(true);
    expect(shouldAttempt(new Date(now.getTime() - 30 * HOUR_MS), false, now)).toBe(true);
  });

  it("latest attempt valid → skip regardless of age", () => {
    expect(shouldAttempt(new Date(now.getTime() - HOUR_MS), true, now)).toBe(false);
    expect(shouldAttempt(new Date(now.getTime() - 30 * HOUR_MS), true, now)).toBe(false);
  });

  it("cooldown is exactly 25h (one retry per nightly run)", () => {
    expect(RETRY_INTERVAL_MS).toBe(25 * 60 * 60 * 1000);
  });
});

describe("runExtractionSweep kill-switch", () => {
  it("short-circuits to zeros when CATALOGUE_AUTO_EXTRACT is not '1'", async () => {
    const prev = process.env.CATALOGUE_AUTO_EXTRACT;
    process.env.CATALOGUE_AUTO_EXTRACT = "0";
    try {
      await expect(runExtractionSweep()).resolves.toEqual({ extracted: 0, skipped: 0, failed: 0 });
    } finally {
      if (prev === undefined) delete process.env.CATALOGUE_AUTO_EXTRACT;
      else process.env.CATALOGUE_AUTO_EXTRACT = prev;
    }
  });
});

describe("sweep wiring (source drift guard)", () => {
  const runner = readFileSync(new URL("../src/server/catalogues/extraction-runner.ts", import.meta.url), "utf8");
  const queue = readFileSync(new URL("../src/server/jobs/queue.ts", import.meta.url), "utf8");

  it("kill-switch is read inside runExtractionSweep (per invocation), not at import time", () => {
    const fnIdx = runner.indexOf("export async function runExtractionSweep");
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    // Search from the function start so the doc comment's mention doesn't count.
    expect(runner.indexOf("CATALOGUE_AUTO_EXTRACT", fnIdx)).toBeGreaterThan(fnIdx);
  });

  it("queue registers and schedules the sweep at 41 6 * * *, after catalogue-sync", () => {
    expect(queue).toContain('"page-extraction"');
    expect(queue).toContain('await boss.schedule("page-extraction", "41 6 * * *")');
    expect(queue.indexOf('boss.schedule("page-extraction"')).toBeGreaterThan(
      queue.indexOf('boss.schedule("catalogue-sync"'),
    );
  });

  it(".env.example documents the kill-switch and budget", () => {
    const env = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    expect(env).toContain("CATALOGUE_AUTO_EXTRACT=0");
    expect(env).toContain("CATALOGUE_EXTRACT_BUDGET=20");
  });
});
