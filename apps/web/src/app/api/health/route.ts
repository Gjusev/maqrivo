import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import path from "node:path";
import { pathExists } from "@/server/fs";

/** Liveness + dependency probe (DB connectivity, solver script presence). */
export async function GET() {
  const checks: Record<string, string> = {};
  try {
    await db.execute(sql`select 1`);
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }
  const solverDir = process.env.SOLVER_DIR ?? path.resolve(process.cwd(), "../../solver");
  checks.solver = (await pathExists(`${solverDir}/worker.py`)) ? "ok" : "missing";
  const healthy = checks.db === "ok" && checks.solver === "ok";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503 });
}
