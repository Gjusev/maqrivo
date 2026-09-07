/**
 * pg-boss job queue (Postgres-backed, in-process). Started from
 * instrumentation.ts in the server runtime; never during build.
 * Schedules: expiry + Open Prices sync + catalogue pipeline daily, store
 * discovery weekly (Mondays) — off-minute per policy.
 */
import { runOpenPricesSync } from "../ingestion/openprices-sync";
import { runPromotionExpiry } from "../ingestion/promotions";
import { runCatalogueSync } from "../ingestion/catalogue-sync";
import { runExtractionSweep } from "../catalogues/extraction-runner";
import { runStoreDiscoverySweep } from "../stores/discovery";
// Flipbook adapters register themselves on import — a source must be
// registered for the catalogue-sync job to touch that retailer.
import "../integrations/retailers/adapters";

const JOBS = ["promotion-expiry", "openprices-sync", "catalogue-sync", "page-extraction", "store-discovery"] as const;
type JobName = (typeof JOBS)[number];

let bossInstance: import("pg-boss").PgBoss | null = null;

export async function startWorker(connectionString: string): Promise<void> {
  if (bossInstance) return;
  const { PgBoss } = await import("pg-boss");
  const boss = new PgBoss({
    connectionString,
    max: 2,
  });

  boss.on("error", (err: Error) => console.error("[pg-boss]", err.message));

  await boss.start();

  for (const name of JOBS) {
    await boss.createQueue(name);
    await boss.work(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await runJob(job.name as JobName);
      }
    });
  }

  // Idempotent: schedules are keyed by name.
  await boss.schedule("promotion-expiry", "17 5 * * *");
  await boss.schedule("openprices-sync", "43 5 * * *");
  await boss.schedule("catalogue-sync", "09 6 * * *");
  await boss.schedule("page-extraction", "41 6 * * *"); // after catalogue-sync (09 6), off-minute
  await boss.schedule("store-discovery", "23 4 * * 1"); // Mondays 04:23, off-minute

  bossInstance = boss;
  console.log("[pg-boss] worker started");
}

async function runJob(name: JobName): Promise<void> {
  if (name === "promotion-expiry") {
    const r = await runPromotionExpiry();
    console.log(`[job] promotion-expiry: ${String(r.expired)} expired`);
  } else if (name === "openprices-sync") {
    const r = await runOpenPricesSync();
    console.log(
      `[job] openprices-sync: ${String(r.observationsImported)} imported / ${String(r.pricesSeen)} seen (${String(r.warnings.length)} warnings)`,
    );
  } else if (name === "catalogue-sync") {
    const r = await runCatalogueSync();
    console.log(`[job] catalogue-sync: ${String(r.stores)} stores / ${String(r.newPages)} new pages`);
  } else if (name === "page-extraction") {
    const r = await runExtractionSweep();
    console.log(
      `[job] page-extraction: ${String(r.extracted)} extracted / ${String(r.skipped)} skipped / ${String(r.failed)} failed / ${String(r.promoted)} auto-confirmed`,
    );
  } else if (name === "store-discovery") {
    const r = await runStoreDiscoverySweep();
    console.log(`[job] store-discovery: ${String(r.users)} users / ${String(r.discovered)} discovered`);
  }
}

/** Manual trigger from the admin view (dev/authorized use). */
export async function triggerJob(name: JobName): Promise<void> {
  if (!bossInstance) throw new Error("worker-not-running");
  await bossInstance.send(name, { manual: true });
}
