/**
 * Container entrypoint: migrate schema → ensure global seed → start server.
 * Both bundled scripts are self-contained (drizzle + pg inside); the global
 * seed is idempotent, so repeated boots are safe.
 */
const { spawnSync } = require("node:child_process");

function run(script, label) {
  const result = spawnSync(process.execPath, [script], { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`entrypoint: ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

run("/opt/bootstrap/migrate.cjs", "migrations");

// Fresh installs need the retailer + food-concept catalog; SK is opt-out.
if (process.env.SEED_ON_BOOT !== "false") {
  run("/opt/bootstrap/seed.cjs", "global seed");
}

const server = spawnSync(process.execPath, ["apps/web/server.js"], { stdio: "inherit", env: process.env });
process.exit(server.status ?? 1);
