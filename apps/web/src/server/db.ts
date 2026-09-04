import { createDb } from "@maqrivo/db";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

/** Singleton pool: survives HMR in dev via globalThis. */
const globalForDb = globalThis as unknown as { __maqrivoDb?: ReturnType<typeof createDb> };

export const db = globalForDb.__maqrivoDb ?? createDb(connectionString);
if (process.env.NODE_ENV !== "production") globalForDb.__maqrivoDb = db;
