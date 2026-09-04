import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { receipt, sourceEvidence, store } from "@maqrivo/db";
import { auth } from "@/server/auth";
import { saveImage } from "@/server/storage";

/** Upload a receipt photo: multipart (photo, storeId, purchasedOn). */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart-required" }, { status: 400 });
  const file = form.get("photo");
  const storeId = String(form.get("storeId") ?? "");
  const purchasedOn = String(form.get("purchasedOn") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "no-photo" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn)) {
    return NextResponse.json({ error: "invalid-date" }, { status: 400 });
  }

  const storeRow = (await db.select().from(store).where(eq(store.id, storeId)).limit(1))[0];
  if (!storeRow) return NextResponse.json({ error: "unknown-store" }, { status: 400 });

  try {
    const { storageKey, contentHash } = await saveImage("receipts", {
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    const evidence = (
      await db
        .insert(sourceEvidence)
        .values({
          kind: "receipt_photo",
          storeId,
          storageKey,
          contentHash,
          ownerUserId: session.user.id,
        })
        .returning()
    )[0]!;
    const inserted = (
      await db
        .insert(receipt)
        .values({
          userId: session.user.id,
          storeId,
          purchasedOn,
          evidenceId: evidence.id,
        })
        .returning()
    )[0]!;
    return NextResponse.json({ receiptId: inserted.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload-failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
