import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { cataloguePage } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { readImage } from "@/server/storage";

/** Serve a catalogue page photo (auth-gated). */
export async function GET(_request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { pageId } = await params;

  const page = (await db.select().from(cataloguePage).where(eq(cataloguePage.id, pageId)).limit(1))[0];
  if (!page?.imageKey) return NextResponse.json({ error: "not-found" }, { status: 404 });

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
