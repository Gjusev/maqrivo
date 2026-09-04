import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { auth } from "./auth";
import { usersProfile } from "@maqrivo/db";

export interface SessionContext {
  userId: string;
  userName: string;
  userEmail: string;
  locale: string;
  homeLat: number | null;
  homeLng: number | null;
  locationLabel: string | null;
}

/** Authenticated session + Maqrivo profile in one call. Null when signed out. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rows = await db
    .select()
    .from(usersProfile)
    .where(eq(usersProfile.userId, session.user.id))
    .limit(1);
  const profile = rows[0];

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    locale: profile?.locale ?? "fr",
    homeLat: profile?.homeLat ?? null,
    homeLng: profile?.homeLng ?? null,
    locationLabel: profile?.locationLabel ?? null,
  };
}
