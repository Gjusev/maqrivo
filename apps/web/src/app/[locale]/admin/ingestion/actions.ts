"use server";

import { revalidatePath } from "next/cache";
import { triggerJob } from "@/server/jobs/queue";
import { getSessionContext, isAdmin } from "@/server/session";

export async function triggerJobAction(
  job:
    | "promotion-expiry"
    | "pantry-consumption"
    | "openprices-sync"
    | "catalogue-sync"
    | "page-extraction"
    | "store-discovery"
    | "plan-refresh"
    | "digest-push",
): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session || !(await isAdmin())) return { ok: false };
  try {
    await triggerJob(job);
    revalidatePath("/admin/ingestion");
    return { ok: true };
  } catch {
    // Worker not running (e.g. build-time request): run inline as a fallback.
    if (job === "promotion-expiry") {
      const { runPromotionExpiry } = await import("@/server/ingestion/promotions");
      await runPromotionExpiry();
    } else if (job === "catalogue-sync") {
      const { runCatalogueSync } = await import("@/server/ingestion/catalogue-sync");
      await runCatalogueSync();
    } else if (job === "pantry-consumption") {
      const { runPantryConsumptionSweep } = await import("@/server/pantry/loop");
      await runPantryConsumptionSweep();
    } else if (job === "page-extraction") {
      const { runExtractionSweep } = await import("@/server/catalogues/extraction-runner");
      await runExtractionSweep(new Date(), { manual: true });
    } else if (job === "store-discovery") {
      const { runStoreDiscoverySweep } = await import("@/server/stores/discovery");
      await runStoreDiscoverySweep();
    } else if (job === "plan-refresh") {
      const { runPlanRefreshSweep } = await import("@/server/optimization/plan-refresh");
      await runPlanRefreshSweep();
    } else if (job === "digest-push") {
      const { runDailyDigestPush } = await import("@/server/notifications/daily-push");
      await runDailyDigestPush();
    } else {
      const { runOpenPricesSync } = await import("@/server/ingestion/openprices-sync");
      await runOpenPricesSync();
    }
    revalidatePath("/admin/ingestion");
    return { ok: true };
  }
}
