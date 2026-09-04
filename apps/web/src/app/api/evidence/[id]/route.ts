import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sourceEvidence } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { readImage } from "@/server/storage";

/** Serve an evidence photo to its owner only (no public URLs). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const evidence = (await db.select().from(sourceEvidence).where(eq(sourceEvidence.id, id)).limit(1))[0];
  if (!evidence?.storageKey) return NextResponse.json({ error: "not-found" }, { status: 404 });
  if (evidence.ownerUserId && evidence.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buffer = await readImage(evidence.storageKey);
    const mime = evidence.storageKey.endsWith(".png")
      ? "image/png"
      : evidence.storageKey.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "content-type": mime, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "missing-file" }, { status: 404 });
  }
}
