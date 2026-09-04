/**
 * pg-boss job queue (Postgres-backed, in-process). Started from
 * instrumentation.ts in the server runtime; never during build.
 * Schedules: expiry + Open Prices sync daily, off-minute per policy.
 */
import { runOpenPricesSync } from "../ingestion/openprices-sync";
import { runPromotionExpiry } from "../ingestion/promotions";

const JOBS = ["promotion-expiry", "openprices-sync"] as const;
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
  }
}

/** Manual trigger from the admin view (dev/authorized use). */
export async function triggerJob(name: JobName): Promise<void> {
  if (!bossInstance) throw new Error("worker-not-running");
  await bossInstance.send(name, { manual: true });
}
