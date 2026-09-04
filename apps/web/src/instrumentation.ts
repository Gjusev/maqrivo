/**
 * Next.js instrumentation: starts the background job worker inside the
 * server runtime (dev and production), never during build.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { startWorker } = await import("./server/jobs/queue");
  try {
    await startWorker(process.env.DATABASE_URL);
  } catch (err) {
    // Jobs are an enhancement: the app must still serve if the queue fails.
    console.error("[instrumentation] worker failed to start:", err instanceof Error ? err.message : err);
  }
}
