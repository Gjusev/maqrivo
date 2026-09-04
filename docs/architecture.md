# Maqrivo Architecture (v1 — pending plan approval)

## Shape

Modular monolith. One Next.js application (App Router) serves UI and API route handlers; background jobs run inside the Node process via pg-boss (Postgres-backed); the deterministic solver is a bundled Python process spawned per solve with a JSON-over-stdio contract (ADR-0001). Deployment is `docker compose`: one app container (Node + Python + solver deps) + one PostgreSQL container. No Redis, no message broker, no microservices.

## Repository layout (pnpm workspaces monorepo)

```
maqrivo/
├── apps/
│   └── web/                    # Next.js 15 (App Router): UI + /api route handlers + jobs runner
├── packages/
│   ├── core/                   # Pure-TS domain logic — no Next, no DB, no network imports allowed
│   │   ├── units/              # g/kg/ml/l/unit conversions (integer/decimal-safe)
│   │   ├── money/              # Money cents arithmetic, formatting via Intl
│   │   ├── nutrition/          # per-100g normalization, recipe totals, scaling, rounding rules
│   │   ├── promotions/         # mechanism evaluation: effective cost per quantity, expiry state
│   │   ├── freshness/          # source-dependent freshness policies, staleness labels
│   │   └── matching/           # ProductResolution: deterministic signals first
│   ├── db/                     # Drizzle schema, migrations, seed; pg-boss wiring
│   └── solver-contract/        # Shared TS types + JSON schemas for the solver protocol (versioned)
├── solver/                     # Python package: CP-SAT models (plan_meals, optimize_basket)
│   ├── worker.py               # stdin/stdout JSON loop
│   └── models/
├── fixtures/                   # Sanitized retailer payloads for adapter parser tests
├── e2e/                        # Playwright end-to-end suites (fr + en)
└── docs/
```

Boundary rules (enforced by lint/dependency rules, not convention): `apps/web` may import everything; `packages/core` imports nothing from apps; adapters and integrations live in `apps/web/src/server/integrations/*`; the solver talks to the app only through `packages/solver-contract`.

## Server-side modules (apps/web/src/server)

- `auth/` — Better Auth wiring (ADR-0002).
- `integrations/` — outbound external world, each with its own client, cache policy, zod schemas, and failure isolation:
  - `openfoodfacts/` — product read/search, import, long-cache.
  - `openprices/` — price observations, location search, discount fields.
  - `osm/` — Overpass store discovery (grid-snapped center), Photon geocode, Nominatim reverse. All proxied; never called from the browser.
  - `supermarche/` — store-directory fallback.
  - `retailers/` — adapter registry: `CarrefourAdapter`, `IntermarcheAdapter`, … Each adapter declares capabilities (`discoverStores`, `fetchCatalogues`, `fetchPromotions`, `fetchPrices`, `resolveRetailerProduct`) via capability flags; the registry composes ingestion jobs only from declared capabilities. No empty adapters.
- `ingestion/` — job handlers + `ingestion_runs` bookkeeping; per-source freshness and caching policies; one adapter failing marks only its own run failed (previously stored data untouched).
- `ai/` — `AIProvider` interface (generateText / generateStructured / analyzeImage) + `ZaiProvider` (ADR-0004). All external text passed to models is delimited as untrusted data; structured outputs are Zod-validated with a bounded repair loop.
- `solver/` — spawns `python worker.py`, streams JSON, enforces timeouts; partial re-solve via locked-variable hints.
- `optimization/` — builds solver input from domain data (candidates, promos, pantry, constraints), interprets output into shopping plans with reason codes.

## Background jobs (pg-boss)

Scheduled: store refresh (weekly), catalogue discovery (daily), promotion expiry (daily), price refresh for enabled stores (daily). On-demand (admin/debug UI): trigger any adapter run. Every run writes an `ingestion_runs` row with per-entity counts, warnings, duration.

## Solver protocol (packages/solver-contract)

Versioned JSON documents over stdio: a `SolveRequest { version, mode: 'plan_meals' | 'optimize_basket', problem, options }` in, `SolveResponse { version, status: 'OPTIMAL'|'FEASIBLE'|'INFEASIBLE'|'ERROR', solution, reasons[], bounds }` out. All integers are cents/grams; money never floats anywhere in the protocol. The Python side pins `ortools` and is a pure function of its input (no DB access) — making it trivially fixture-testable from both languages.

## Frontend

Next.js App Router, RSC-first with client islands for interactive surfaces (shopping list checkboxes, map, barcode scanning, assistant chat). Mobile-first PWA: manifest, service worker caching the active shopping plan and its product data (offline-tolerant), install prompt. i18n via next-intl with `/en`/`/fr` path prefixes; browser-language detection on first visit; preference persisted in `users_profile.locale`; every UI string from message catalogs (ADR on policy, not mechanism). MapLibre GL + OpenFreeMap tiles. Barcode: `BarcodeDetector` where available, ZXing-wasm fallback, manual entry always.

## Security & privacy posture

- Secrets only via env (`AI_PROVIDER`, `ZAI_API_KEY`, `ZAI_TEXT_MODEL`, `ZAI_VISION_MODEL`, `DATABASE_URL`, `SIGNUP_INVITE_CODE`, …); nothing provider-related reaches the browser.
- All external geo calls are server-side with grid-snapped centers; precise home coordinates never leave the server.
- Retailer/aggregator content is untrusted input: zod-validated at the boundary, never rendered as HTML, delimiters when fed to AI.
- Uploads (evidence photos): size-capped, MIME-checked, stored on a volume, served through authenticated routes only to the owner.
- Rate limiting on auth + AI-assistant endpoints; structured logs that never include tokens, passwords, or raw coordinates.

## Observability

Structured JSON logs (pino). Ingestion status surface (`/admin/ingestion`) reads `ingestion_runs`: last success/failure per source, record counts, warnings, raw vs normalized views for promotions, resolution states, and manual re-trigger — no direct DB access needed to diagnose a bad match. Health endpoint checks DB + solver availability (spawns a trivial solve).

## Testing

- `packages/core` unit tests (Vitest): units, money, nutrition math, promotion effective costs, freshness — TDD for all deterministic arithmetic.
- Adapter parser tests against `fixtures/` payloads (no live network in CI).
- Solver tests: pytest on Python models; cross-language contract tests from Node with shared fixtures.
- Playwright e2e (`e2e/`): the full acceptance scenario in French and English, mobile viewport included.

## Known deferred (documented, not forgotten)

Route optimization beyond geographic ordering; receipt ingestion; Open Prices write-back; price-trend analytics; additional retailer adapters beyond the first two; EU-provider alternative for AI.
