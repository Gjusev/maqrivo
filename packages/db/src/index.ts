import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/** Client factory — one pool per process; web app and scripts both use this. */
export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export * from "./schema";
