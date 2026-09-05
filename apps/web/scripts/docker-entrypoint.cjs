/**
 * Container entrypoint: migrate schema → ensure global seed → start server.
 * Both bundled scripts are self-contained (drizzle + pg inside); the global
 * seed is idempotent, so repeated boots are safe.
 *
 * Postgres containers briefly listen during init before their real restart:
 * compose healthchecks can green-light that window, so migrations retry
 * with backoff instead of failing the boot.
 */
const { spawnSync } = require("node:child_process");

function run(script, label, attempts = 10) {
  for (let i = 1; i <= attempts; i++) {
    const result = spawnSync(process.execPath, [script], { stdio: "inherit", env: process.env });
    if (result.status === 0) return;
    const last = i === attempts;
    console.error(`entrypoint: ${label} failed (exit ${result.status}, attempt ${i}/${attempts})${last ? "" : " — retrying in 3s"}`);
    if (last) process.exit(result.status ?? 1);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
}

run("/opt/bootstrap/migrate.cjs", "migrations");

// Fresh installs need the retailer + food-concept catalog; opt-out available.
if (process.env.SEED_ON_BOOT !== "false") {
  run("/opt/bootstrap/seed.cjs", "global seed", 3);
}

const server = spawnSync(process.execPath, ["apps/web/server.js"], { stdio: "inherit", env: process.env });
process.exit(server.status ?? 1);
