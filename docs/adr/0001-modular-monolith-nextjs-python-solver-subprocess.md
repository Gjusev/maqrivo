# Modular monolith: Next.js app with Python solver subprocess

Maqrivo is a single Next.js application (App Router: UI + API route handlers) backed by PostgreSQL, with background jobs running inside the Node process via a Postgres-backed queue. Deterministic optimization runs in a bundled Python worker process spawned on demand (JSON over stdin/stdout), not as a network service. We chose this over a Python HTTP sidecar because the spec's scale (one user, a few solves per day) does not justify a second service's operational cost, and over a pure-TypeScript solver because JS has no first-class CP-SAT/MIP solver with the guarantees multi-buy promotions, budget caps, and store-count constraints require.

## Consequences

- One Docker image contains both Node and Python; the solver boundary is a versioned JSON contract, so the solver library (CP-SAT vs HiGHS) can change without touching the app.
- Windows dev requires a local Python 3.12 with the solver package installed (or the containerized dev setup).
- Solver latency must be managed at the contract level (timeouts, partial solutions), since a crashed subprocess is an app-level failure, not an independent service failure.
