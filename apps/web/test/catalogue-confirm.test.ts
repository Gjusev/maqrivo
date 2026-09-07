import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPrintedDates } from "../src/server/catalogues/extraction";
import type { CatalogueCandidate } from "../src/server/catalogues/extraction";

/**
 * Plan 003: the review flow must survive reloads (hydrated candidates),
 * stay idempotent (dedup pre-check) and show typed server failures
 * (actionError). The DB-backed pieces are guarded at the source level,
 * as catalogue-sync-branch.test.ts does for catalogue sync.
 */

const PAGE_CARD = readFileSync(
  new URL("../src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx", import.meta.url),
  "utf8",
);

const cand = (validUntil: string | null): CatalogueCandidate => ({
  index: 0,
  description: "Filets de poulet 600 g",
  brand: null,
  mechanism: "PROMO_PRICE",
  promoPriceCents: 799,
  regularPriceCents: null,
  pricePerKgCents: null,
  bundleQty: null,
  discountPct: null,
  loyalty: false,
  position: null,
  packSize: null,
  validUntil,
});

describe("applyPrintedDates (validity preference shared by extract + hydration)", () => {
  it("picks the first printed validUntil over any existing value", () => {
    expect(applyPrintedDates([cand(null), cand("2026-09-18")], "2026-12-31")).toBe("2026-09-18");
  });

  it("keeps the current value when no candidate prints a date", () => {
    expect(applyPrintedDates([cand(null), cand(null)], "2026-12-31")).toBe("2026-12-31");
  });

  it("falls back to the 9-day heuristic when nothing is set", () => {
    const got = applyPrintedDates([cand(null)], null);
    const ms = Date.parse(`${got}T00:00:00Z`);
    expect(Number.isNaN(ms)).toBe(false);
    expect(ms).toBeGreaterThan(Date.now() + 8 * 86_400_000);
    expect(ms).toBeLessThan(Date.now() + 10 * 86_400_000);
  });
});

describe("page-card review flow (source drift guard)", () => {
  it("renders actionError so typed server failures are visible", () => {
    expect(/\{actionError\s*\?/.test(PAGE_CARD)).toBe(true);
  });

  it("accepts initialCandidates for reload hydration", () => {
    expect(/initialCandidates\?\s*:/.test(PAGE_CARD)).toBe(true);
  });
});
