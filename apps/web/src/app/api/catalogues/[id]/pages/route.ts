import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { catalogue, cataloguePage, sourceEvidence } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { saveImage, UploadRejectedError } from "@/server/storage";

/**
 * Page photo upload for a catalogue (multipart). Photos become evidence:
 * the user's own copy of the leaflet — the "view source" behind every deal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const cat = (await db.select().from(catalogue).where(eq(catalogue.id, id)).limit(1))[0];
  if (!cat) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart-required" }, { status: 400 });
  const files = form.getAll("pages").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no-files" }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "too-many" }, { status: 400 });

  const numberRows = await db
    .select({ nextNumber: sql<number>`coalesce(max(${cataloguePage.pageNumber}), 0)::int + 1` })
    .from(cataloguePage)
    .where(eq(cataloguePage.catalogueId, id));

  const created: { pageId: string; pageNumber: number }[] = [];
  let pageNumber = numberRows[0]?.nextNumber ?? 1;
  try {
    for (const file of files) {
      const { storageKey, contentHash } = await saveImage(`catalogues/${id}`, {
        mime: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      const evidence = (
        await db
          .insert(sourceEvidence)
          .values({
            kind: "catalogue_page",
            catalogueId: cat.id,
            page: pageNumber,
            storageKey,
            contentHash,
            ownerUserId: session.user.id,
          })
          .returning()
      )[0]!;
      const page = (
        await db
          .insert(cataloguePage)
          .values({ catalogueId: id, pageNumber, imageKey: storageKey, contentHash })
          .returning()
      )[0]!;
      void evidence;
      created.push({ pageId: page.id, pageNumber });
      pageNumber += 1;
    }
  } catch (err) {
    if (err instanceof UploadRejectedError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json({ pages: created });
}
