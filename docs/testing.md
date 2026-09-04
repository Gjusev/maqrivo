# Maqrivo Testing Strategy (v1 — pending plan approval)

TDD for all deterministic domain behavior: tests are written with (or before) the implementation of every calculation.

## Unit — `packages/core` (Vitest, no I/O allowed in suite)

Units and conversion (g/kg/ml/l/unit; compound packs), money arithmetic (cents, rounding at display boundaries only), nutrition normalization (per-100 g basis, serving conversions, no false precision — round to source precision), recipe scaling, package math (packs needed for 700 g from 600 g/1 kg/weight), price-per-kg/l/100 g, protein-per-euro and cost-per-10 g protein, promotion mechanics (PROMO_PRICE, PERCENTAGE, MULTIBUY piecewise, BUY_X_GET_Y odd-quantity cases, SECOND_UNIT, LOYALTY_PRICE gating, cashback credits), promotion expiry state transitions, freshness policies per source, pantry deduction (expiry-aware), product matching (barcode exact → retailer id → brand+normalized name → packaging; EXACT/PROBABLE/AMBIGUOUS/UNRESOLVED), locale formatting snapshots (fr: `1,99 €`, `2,5 km`, `4 septembre 2026`; en: `€1.99`, `2.5 km`, `September 4, 2026`).

## Adapter parsers (Vitest, fixtures only)

`fixtures/<retailer>/*` sanitized payloads; parser tests assert normalized output. No live retailer traffic in CI, ever.

## Solver (pytest + cross-language contract tests)

Python model tests per mode (coverage, budget softness, travel penalty, locks, infeasibility cores, preset weight vectors); Node↔Python contract tests run the real subprocess against shared JSON fixtures (deterministic, cents/grams only).

## Integration (Vitest + real Postgres via docker)

Drizzle migrations apply cleanly; append-only price observation behavior; promotion expiry job; ingestion run bookkeeping; adapter clients against recorded zod-validated payloads.

## End-to-end (Playwright, `e2e/`)

The acceptance scenario, run in **French and English**, mobile viewport (390 px) and desktop: signup (invite code) → locale fr → location Courbevoie → store discovery → add custom halal butcher → nutrition profile → barcode import → custom product → manual price → recipes → pantry → meal plan → optimizer → shopping plan grouped by store → evidence inspection → mark purchased → switch to English → same underlying data intact. Plus failure states: empty store list, missing price, stale price, expired promotion, AI-unavailable degradation.

## Gates

`pnpm lint` (eslint strict TS), `pnpm typecheck`, `pnpm test` (core + adapters + contract + integration), `pnpm test:e2e`, `pytest` in solver. All green before any milestone is called done.
