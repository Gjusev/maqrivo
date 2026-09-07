import { describe, expect, it } from "vitest";
import type { CatalogueCandidate } from "../src/server/catalogues/extraction";

/**
 * Plan 006: the auto-confirm gate is the load-bearing safety of overnight
 * promotion creation — only strictly deterministic signals promote. The
 * DB-backed promoteCandidate route (insert → match → delete unless EXACT)
 * needs live data; the decision function is pure and exercised for real.
 */

// The module graph reaches server/db, which requires DATABASE_URL at import
// time. The pg pool connects lazily and nothing here queries, so a
// placeholder is enough to import the pure pieces.
process.env.DATABASE_URL ??= "postgres://maqrivo:maqrivo@localhost:5432/maqrivo";
const { autoConfirmDecision } = await import("../src/server/catalogues/auto-confirm");

const candidate = (overrides: Partial<CatalogueCandidate>): CatalogueCandidate => ({
  index: 0,
  description: "Filets de poulet 600 g",
  brand: null,
  mechanism: "PROMO_PRICE",
  promoPriceCents: 499,
  regularPriceCents: 649,
  pricePerKgCents: null,
  bundleQty: null,
  discountPct: null,
  loyalty: false,
  position: null,
  packSize: null,
  validUntil: "2026-09-18",
  ...overrides,
});

describe("autoConfirmDecision (deterministic-only gate)", () => {
  it.each([
    {
      name: "price + printed date + EXACT match → promotable",
      candidate: candidate({}),
      matchState: "EXACT" as const,
      expected: { promotable: true, reason: "ok" },
    },
    {
      name: "heuristic date (validUntil null — the 9-day fallback was applied) → no-date",
      candidate: candidate({ validUntil: null }),
      matchState: null,
      expected: { promotable: false, reason: "no-date" },
    },
    {
      name: "PERCENTAGE_OFF without discountPct → no-price",
      candidate: candidate({ mechanism: "PERCENTAGE_OFF", discountPct: null }),
      matchState: "EXACT" as const,
      expected: { promotable: false, reason: "no-price" },
    },
    {
      name: "PROBABLE match → no-match (EXACT only, never fuzzy)",
      candidate: candidate({}),
      matchState: "PROBABLE" as const,
      expected: { promotable: false, reason: "no-match" },
    },
    {
      name: "UNRESOLVED match → no-match",
      candidate: candidate({}),
      matchState: "UNRESOLVED" as const,
      expected: { promotable: false, reason: "no-match" },
    },
  ])("$name", ({ candidate: c, matchState, expected }) => {
    expect(autoConfirmDecision(c, matchState)).toEqual(expected);
  });
});

describe("autoConfirmDecision leg order (first failing reason wins)", () => {
  it("no price and no date → no-price, not no-date", () => {
    expect(autoConfirmDecision(candidate({ promoPriceCents: null, pricePerKgCents: null, validUntil: null }), null)).toEqual({
      promotable: false,
      reason: "no-price",
    });
  });

  it("priced but undated beats the match leg → no-date even with EXACT pending", () => {
    expect(autoConfirmDecision(candidate({ validUntil: null }), "EXACT")).toEqual({
      promotable: false,
      reason: "no-date",
    });
  });

  it("pricePerKg alone satisfies the price leg", () => {
    expect(
      autoConfirmDecision(candidate({ promoPriceCents: null, regularPriceCents: null, pricePerKgCents: 790 }), "EXACT"),
    ).toEqual({ promotable: true, reason: "ok" });
  });

  it("PERCENTAGE_OFF with discountPct and a printed price passes the price leg", () => {
    expect(autoConfirmDecision(candidate({ mechanism: "PERCENTAGE_OFF", discountPct: 30 }), "EXACT")).toEqual({
      promotable: true,
      reason: "ok",
    });
  });
});
