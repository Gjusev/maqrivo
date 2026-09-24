# Getting started

## Requirements

- Node.js 22+, pnpm 11
- Docker (for PostgreSQL)
- Python 3.11+ with [uv](https://docs.astral.sh/uv/) (for the CP-SAT solver)

## Setup

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# Set SIGNUP_INVITE_CODE and a random BETTER_AUTH_SECRET in .env
cp .env apps/web/.env.local      # Next.js loads env from apps/web/
uv sync --directory solver        # solver venv (OR-Tools)
pnpm dev:deps                     # postgres 17 via docker compose
pnpm db:migrate
pnpm --filter @maqrivo/db seed:global   # retailers + food concepts
pnpm db:seed                      # optional: dev user, recipes, weekly plan
pnpm dev                          # http://localhost:3000 (/fr default, /en available)
```

The development seed creates `dev@maqrivo.local` / `dev-password-123`.
Keep `.env` and `apps/web/.env.local` in sync when changing configuration.

## AI features

Recipe generation and the assistant require a provider key (`ZAI_API_KEY`
in `.env` / `apps/web/.env.local`). Without a key, every deterministic
feature — planning, basket optimization, nutrition, pantry — works; the
model only proposes, code verifies. See [ai.md](ai.md).

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm --filter @maqrivo/core test
pnpm --filter @maqrivo/web test
uv run --directory solver --with pytest pytest -q
pnpm test:e2e        # Playwright (app must be running)
```

The root `pnpm test` also traverses the e2e workspace, so it requires the
seeded app to be running. Use the filtered commands above for unit tests
without a browser server. The solver command uses its own uv environment and
adds pytest for the test run; pytest is not a runtime solver dependency.

## Deployment

```bash
POSTGRES_PASSWORD=... docker compose -f compose.prod.yaml up -d --build
```

One app container (Node + Python + solver) plus PostgreSQL. See
[deployment.md](deployment.md) for volumes, backups and env reference.
