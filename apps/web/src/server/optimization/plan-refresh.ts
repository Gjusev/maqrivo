/**
 * Opt-in weekly plan refresh (plan 013), scheduled Sundays 07:19 — after
 * the week's final ingestion, before the shopping week starts. Only users
 * who flipped the profile flag are ever touched; everyone else gets the
 * badge and nothing else. Locked slots survive: the planner re-writes them
 * via its lockedBySlot map (planner.ts).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { mealPlan, nutritionProfile } from "@maqrivo/db";
import { runWeeklyPlanForUser } from "./planner";
import { computePlanStaleness } from "./staleness";

/**
 * nutritionProfile is history-kept (latest row wins), so the flag is read
 * from the latest row per user — a stale older row must not opt anyone in.
 * WHERE-before-DISTINCT-ON would get this wrong; filter after.
 */
async function optedInUserIds(): Promise<string[]> {
  const latest = await db
    .selectDistinctOn([nutritionProfile.userId], {
      userId: nutritionProfile.userId,
      autoRefreshPlan: nutritionProfile.autoRefreshPlan,
    })
    .from(nutritionProfile)
    .orderBy(nutritionProfile.userId, desc(nutritionProfile.createdAt));
  return latest.filter((r) => r.autoRefreshPlan).map((r) => r.userId);
}

export async function runPlanRefreshSweep(): Promise<{ users: number; refreshed: number }> {
  const userIds = await optedInUserIds();
  let refreshed = 0;
  for (const userId of userIds) {
    try {
      const plan = (
        await db
          .select({ id: mealPlan.id })
          .from(mealPlan)
          .where(and(eq(mealPlan.userId, userId), eq(mealPlan.status, "active")))
          .orderBy(desc(mealPlan.createdAt))
          .limit(1)
      )[0];
      if (!plan) {
        console.log(`[job] plan-refresh ${userId}: skipped-error no-active-plan`);
        continue;
      }
      const staleness = await computePlanStaleness(plan.id);
      if (!staleness.stale) {
        console.log(`[job] plan-refresh ${userId}: skipped-fresh`);
        continue;
      }
      const result = await runWeeklyPlanForUser(userId);
      if (result.ok) {
        refreshed++;
        console.log(`[job] plan-refresh ${userId}: refreshed`);
      } else {
        console.log(`[job] plan-refresh ${userId}: skipped-error ${result.error ?? "failed"}`);
      }
    } catch (err) {
      console.log(`[job] plan-refresh ${userId}: skipped-error ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  return { users: userIds.length, refreshed };
}
