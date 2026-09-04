import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { runWeeklyPlan } from "@/server/optimization/planner";

/** Dev-only: run the full weekly pipeline for the signed-in user. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { objective } = (await request.json().catch(() => ({}))) as { objective?: string };
  const result = await runWeeklyPlan(session.user.id, objective);
  return NextResponse.json(result);
}
