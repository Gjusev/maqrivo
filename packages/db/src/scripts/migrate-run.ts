/**
 * Standalone migration runner for container boot. Bundled to plain JS at
 * Docker build time (no node_modules dependency at runtime) and pointed at
 * the SQL folder copied into the image.
 *
 *   MIGRATIONS_DIR=/opt/migrations DATABASE_URL=... node migrate.cjs
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const folder = process.env.MIGRATIONS_DIR ?? "/opt/migrations";
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const db = drizzle(connectionString);
  await migrate(db, { migrationsFolder: folder });
  console.log(`migrate: applied journal in ${folder}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
