import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { isAdminUser } from "./admin";
import { db } from "./db";
import { auth } from "./auth";
import { user as userTable, usersProfile } from "@maqrivo/db";

export interface SessionContext {
  userId: string;
  userName: string;
  userEmail: string;
  locale: string;
  homeLat: number | null;
  homeLng: number | null;
  locationLabel: string | null;
}

/** Profile-derived context for a known user (no HTTP session required). */
export async function loadUserContext(userId: string): Promise<SessionContext | null> {
  const userRow = (await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1))[0];
  if (!userRow) return null;
  const profile = (await db.select().from(usersProfile).where(eq(usersProfile.userId, userId)).limit(1))[0];
  return {
    userId,
    userName: userRow.name,
    userEmail: userRow.email,
    locale: profile?.locale ?? "fr",
    homeLat: profile?.homeLat ?? null,
    homeLng: profile?.homeLng ?? null,
    locationLabel: profile?.locationLabel ?? null,
  };
}

 /** Authenticated session + Maqrivo profile in one call. Null when signed out. */
 export async function getSessionContext(): Promise<SessionContext | null> {
   const session = await auth.api.getSession({ headers: await headers() });
   if (!session?.user) return null;
  return loadUserContext(session.user.id);
 }

/**
 * Process-lifetime cache of the earliest-created user id. The first account
 * is the admin and registration order never changes in practice, so the id
 * is resolved once per process and reused (no per-request admin lookup).
 */
let cachedEarliestUserId: string | null | undefined;

/**
 * Admin gate for ingestion triggering and global-catalog mutations: the
 * signed-in user must be the earliest-created account (the first registered
 * user). False when signed out or when no users exist yet.
 */
export async function isAdmin(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return false;
  if (cachedEarliestUserId === undefined) {
    const row = (
      await db
        .select({ id: userTable.id })
        .from(userTable)
        .orderBy(asc(userTable.createdAt), asc(userTable.id))
        .limit(1)
    )[0];
    cachedEarliestUserId = row?.id ?? null;
  }
  return isAdminUser(session.user.id, cachedEarliestUserId);
}
