import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { store, userStorePrefs } from "@maqrivo/db";
import { auth } from "@/server/auth";

/** Enabled stores + the user's own custom stores (for price forms). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const enabled = await db
    .select({ id: store.id, name: store.name })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .where(and(eq(userStorePrefs.userId, session.user.id), eq(userStorePrefs.enabled, true)));

  const owned = await db
    .select({ id: store.id, name: store.name })
    .from(store)
    .where(and(eq(store.ownerUserId, session.user.id), isNotNull(store.ownerUserId)));

  const merged = [...enabled];
  for (const s of owned) {
    if (!merged.some((m) => m.id === s.id)) merged.push(s);
  }
  return NextResponse.json({ stores: merged });
}
