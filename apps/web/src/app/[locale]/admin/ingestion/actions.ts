"use server";

import { revalidatePath } from "next/cache";
import { triggerJob } from "@/server/jobs/queue";
import { getSessionContext } from "@/server/session";

export async function triggerJobAction(
  job: "promotion-expiry" | "openprices-sync" | "catalogue-sync" | "page-extraction",
): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
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
    } else if (job === "page-extraction") {
      const { runExtractionSweep } = await import("@/server/catalogues/extraction-runner");
      await runExtractionSweep();
    } else {
      const { runOpenPricesSync } = await import("@/server/ingestion/openprices-sync");
      await runOpenPricesSync();
    }
    revalidatePath("/admin/ingestion");
    return { ok: true };
  }
}
