import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { geocode } from "@/server/integrations/osm/photon";

/** Server-side geocode proxy — the browser never calls Photon directly. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ results: [] });

  const endpoint = process.env.PHOTON_ENDPOINT ?? "https://photon.komoot.io/api";
  const results = await geocode(q, endpoint);
  return NextResponse.json({ results: results.slice(0, 6) });
}
