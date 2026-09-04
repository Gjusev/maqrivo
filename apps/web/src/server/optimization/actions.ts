"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "../session";
import { runWeeklyPlan } from "./planner";

export async function runWeeklyPlanAction(objective?: string): Promise<{
  ok: boolean;
  error?: string;
  status?: string;
  message?: string;
}> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "unauthorized" };
  try {
    const result = await runWeeklyPlan(session.userId, objective);
    revalidatePath("/week");
    revalidatePath("/shopping");
    revalidatePath("/");
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "SolverUnavailableError") {
      return { ok: false, error: "solver-unavailable" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}
