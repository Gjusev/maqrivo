import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { pushSubscription } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { notificationsConfig } from "@/server/notifications/config";

/** Push endpoints are browser-minted https URLs; anything else is a bug or abuse. */
const httpsUrl = z
  .string()
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  });

const subscribeSchema = z.object({
  endpoint: httpsUrl,
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Upsert the caller's subscription — one row per endpoint, re-owned on re-subscribe. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  await db
    .insert(pushSubscription)
    .values({ userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  return NextResponse.json({ ok: true });
}

/** Remove one of the caller's subscriptions (?endpoint=…). */
export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, session.user.id), eq(pushSubscription.endpoint, endpoint)));
  return NextResponse.json({ ok: true });
}

/** Same bootstrap payload as /api/push/config — kept here so the subscribe surface is self-describing. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = notificationsConfig();
  if (!state.configured) return NextResponse.json({ configured: false });
  return NextResponse.json({ configured: true, vapidPublicKey: state.config.vapidPublicKey });
}
