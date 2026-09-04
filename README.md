# Maqrivo

Personal nutrition, meal planning, grocery optimization and supermarket intelligence. Maqrivo answers: *given what I want to eat, my nutrition targets, my budget, what I already have at home, current supermarket prices, promotions and nearby stores — what should I eat this week and what exactly should I buy?*

Core principle: **no evidence, no deal.** Every external price or promotion preserves its provenance (store, product, quantity, price, when observed, source, validity). Missing data beats fabricated data.

## Status

**First complete vertical slice is live and verified** (M0–M11): French/English shell, auth, store discovery around Courbevoie (Overpass + supermarche.com + Carrefour eligibility API), custom stores, Open Food Facts barcode import, manual + Open Prices price observations with freshness, promotions with provenance and expiry, recipes with deterministic nutrition, pantry, CP-SAT meal planning and basket optimization (Python subprocess, OPTIMAL results end-to-end), Z.AI recipe generation (model proposes — Maqrivo verifies macros deterministically; a generated "Curry de poulet au yaourt grec" passed at 786 kcal / 78 g protein per serving), and a tool-using assistant. 158 automated tests green (113 core, 22 web, 19 solver, 4 e2e).

## Stack

Next.js 16 (App Router, TypeScript strict) · PostgreSQL 17 + Drizzle · pg-boss jobs · Python + OR-Tools CP-SAT solver subprocess · next-intl (en/fr) · Better Auth · MapLibre + OpenStreetMap ecosystem · Z.AI general API behind a provider abstraction · Docker Compose deployment.

## Local development

```bash
pnpm install
cp .env.example .env            # set SIGNUP_INVITE_CODE, BETTER_AUTH_SECRET
pnpm dev:deps                   # postgres via docker compose
pnpm db:migrate && pnpm db:seed # seed optional, dev-only data
pnpm dev                        # http://localhost:3000 (/fr default, /en available)
```

Gates: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm solver:test` · `pnpm test:e2e`

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — runtime shape, module boundaries, security posture
- [`docs/data_sources.md`](docs/data_sources.md) — every external source, verified access, fallbacks
- [`docs/domain_model.md`](docs/domain_model.md) — schema design and invariants
- [`docs/optimization.md`](docs/optimization.md) — CP-SAT models, presets, explainability
- [`docs/retailer_adapters.md`](docs/retailer_adapters.md) — adapter inventory and behavior rules
- [`docs/ai.md`](docs/ai.md) — provider abstraction, authority boundaries, injection defense
- [`docs/deployment.md`](docs/deployment.md) — services, env, volumes, backups
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`CONTEXT.md`](CONTEXT.md) — domain glossary (canonical language)

## Known limitations

Prices at French retailers rest on Open Prices (crowd coverage), user observations and manually entered promotions — retailer sites are accessed only via public endpoints with hard backoff, never by bypassing protections (ADR-0005). Nutrition data quality follows Open Food Facts and manual entry; freshness is always displayed.
