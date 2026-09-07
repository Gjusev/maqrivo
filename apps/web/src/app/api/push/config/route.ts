import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { notificationsConfig } from "@/server/notifications/config";

/** Client bootstrap: is push configured, and which VAPID key should it use? */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const state = notificationsConfig();
  if (!state.configured) return NextResponse.json({ configured: false });
  return NextResponse.json({ configured: true, vapidPublicKey: state.config.vapidPublicKey });
}
