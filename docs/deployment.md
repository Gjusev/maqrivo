# Maqrivo Deployment (v1 — pending plan approval)

Target: a normal Linux VPS, Docker Compose, explicit persistence. No managed-cloud dependencies.

## Services

- **app** — single image containing Node (Next.js standalone output) + Python 3.12 + `ortools`; runs web server, pg-boss worker loop (in-process), and spawns the solver subprocess on demand.
- **db** — `postgres:17` with a named volume; healthcheck `pg_isready`.

## Developer flow

```
git clone … && cd maqrivo
cp .env.example .env            # set SIGNUP_INVITE_CODE (required), optionally ZAI_API_KEY
docker compose up -d db         # or: pnpm dev:deps
pnpm install
pnpm db:migrate && pnpm db:seed # seed optional, dev-only data
pnpm dev                        # http://localhost:3000 (fr default, /en available)
```

Windows note: the solver subprocess needs local Python 3.12 + `pip install -e solver`; `pnpm dev:solver:check` verifies. Full-container dev (`docker compose up app`) avoids local Python entirely.

## Environment variables

`DATABASE_URL` (required) · `SIGNUP_INVITE_CODE` (required — gates registration) · `BETTER_AUTH_SECRET` (required) · `APP_URL` · `AI_PROVIDER` (`zai`) · `ZAI_API_KEY` · `ZAI_TEXT_MODEL` / `ZAI_VISION_MODEL` / `ZAI_BUDGET_MODEL` · `OFF_USER_AGENT_EMAIL` (polite OFF access) · `OVERPASS_ENDPOINT` · `PHOTON_ENDPOINT` · `UPLOAD_VOLUME_PATH` · `INGESTION_*` schedule overrides. Secrets only via env; `.env` git-ignored; `.env.example` documents every variable without values.

## Volumes & backups

`pgdata` (database), `uploads` (evidence photos, product images). Backups: nightly `pg_dump` to the uploads volume + documented restore; documented `docker compose run app pnpm db:migrate` update procedure.

## Ports, health, observability

Only `app:3000` published (reverse-proxy TLS assumed on the host). `/api/health` checks DB connectivity and solver spawn (trivial solve). Structured JSON logs to stdout; ingestion status browsable at `/admin/ingestion` (auth-gated, non-public).

## Data lifecycle

Account deletion removes all user-owned rows (pantry, plans, observations, custom stores/products, uploads); global imported rows (OFF, discovered stores, seeded concepts) remain. JSON export of user-owned data available from Profile.
