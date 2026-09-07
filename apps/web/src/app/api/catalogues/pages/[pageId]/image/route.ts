import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { cataloguePage, sourceEvidence } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { readImage } from "@/server/storage";

/** Serve a catalogue page photo (auth-gated). */
export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { pageId } = await params;

  const page = (await db.select().from(cataloguePage).where(eq(cataloguePage.id, pageId)).limit(1))[0];
  if (!page?.imageKey) return NextResponse.json({ error: "not-found" }, { status: 404 });

  // Page photos resolve to their evidence row: synced leaflets are global
  // (no ownerUserId), user uploads are personal — same rule as /api/evidence.
  const evidence = (
    await db.select().from(sourceEvidence).where(eq(sourceEvidence.storageKey, page.imageKey)).limit(1)
  )[0];
  if (evidence?.ownerUserId && evidence.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = await readImage(page.imageKey);
    const mime = page.imageKey.endsWith(".png")
      ? "image/png"
      : page.imageKey.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "content-type": mime, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "missing-file" }, { status: 404 });
  }
}
