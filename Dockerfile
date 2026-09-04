# Maqrivo app image: Node (Next.js standalone) + Python (CP-SAT solver).
# One container per ADR-0001; the solver runs as an on-demand subprocess.
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip python3-venv curl ca-certificates && rm -rf /var/lib/apt/lists/*

# ── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/solver-contract/package.json packages/solver-contract/
COPY e2e/package.json e2e/
RUN corepack enable && pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm --filter @maqrivo/web build

# ── Solver venv ─────────────────────────────────────────────────────────────
FROM base AS solver
COPY solver/ /opt/solver/
RUN python3 -m venv /opt/solver/.venv && /opt/solver/.venv/bin/pip install --no-cache-dir ortools

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Non-root user.
RUN groupadd -r maqrivo && useradd -r -g maqrivo maqrivo

COPY --from=build --chown=maqrivo:maqrivo /app/apps/web/.next/standalone ./
COPY --from=build --chown=maqrivo:maqrivo /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=maqrivo:maqrivo /app/apps/web/public ./apps/web/public
COPY --from=solver --chown=maqrivo:maqrivo /opt/solver /opt/solver
# Drizzle migrations for entrypoint
COPY --from=build --chown=maqrivo:maqrivo /app/packages/db/drizzle /opt/migrations
ENV SOLVER_DIR=/opt/solver

USER maqrivo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
