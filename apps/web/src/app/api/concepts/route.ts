import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { foodConcept } from "@maqrivo/db";
import { auth } from "@/server/auth";

/** Concept lookup for product linking. Auth-gated, global concepts only. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const concepts = await db.select().from(foodConcept).where(isNull(foodConcept.ownerUserId));
  const filtered = q
    ? concepts.filter(
        (c) => c.nameFr.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) || c.slug.includes(q),
      )
    : concepts;
  return NextResponse.json({
    concepts: filtered.slice(0, 12).map((c) => ({ id: c.id, slug: c.slug, nameFr: c.nameFr, nameEn: c.nameEn, category: c.category })),
  });
}
