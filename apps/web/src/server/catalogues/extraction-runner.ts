/**
 * Vision-extraction core, shared by the manual per-page action and the
 * nightly pg-boss sweep. Session-free by design: `userId` is nullable so
 * system runs still leave provenance rows without inventing a user.
 */
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { aiExtraction, catalogue, cataloguePage, ingestionRun, store, userStorePrefs } from "@maqrivo/db";
import { getAIProvider } from "../ai/provider";
import { readImage } from "../storage";
import { matchesScope } from "../ingestion/offers-scope";
import { loadProductCandidates } from "../ingestion/promotions";
import { candidatesFromExtraction, type CatalogueCandidate } from "./extraction";
import { promoteCandidate } from "./auto-confirm";

/** catalogue-v2 — moved verbatim from the manual action; keep the shape stable (plan 006 reads it). */
const SYSTEM_PROMPT =
  "You read supermarket leaflet pages for a grocery app. Extract every priced offer you can SEE. " +
  "promoPrice/regularPrice are euro amounts printed on the page (numbers only, e.g. 4.99). " +
  "mechanicPhrase is the verbatim French deal phrase if printed (\"le lot de 2\", \"2e à -50%\", \"-30%\", \"prix carte\"). " +
  "packSize is the printed pack format when visible (\"500 g\", \"6x330 ml\", \"1L\"). " +
  "validUntil is the printed offer end date when the page shows a validity range (\"du 10/09 au 18/09\" → \"18/09\"). " +
  "Do NOT invent prices, sizes or dates for items that do not print them. Answer with JSON only: " +
  '{"items":[{"description","brand","promoPrice","regularPrice","pricePerKg","mechanicPhrase","loyalty","position","packSize","validUntil"}]}';

export interface ExtractPageResult {
  ok: boolean;
  error?: string;
  candidates?: CatalogueCandidate[];
}

/**
 * Read one page photo with the vision model and persist the candidates.
 * Identical behavior to the old in-action core except `userId` provenance
 * and failure handling: on AI failure an `aiExtraction` row is still
 * inserted (`validationStatus: "rejected"`, `output.error`) so the sweep's
 * retry cadence can see the attempt, while `processedAt` stays NULL.
 */
export async function runPageExtraction(input: {
  pageId: string;
  userId: string | null; // null = system job
}): Promise<ExtractPageResult> {
  const provider = getAIProvider();
  if (!provider.configured) return { ok: false, error: "ai-not-configured" };

  const pageRow = (
    await db
      .select({ page: cataloguePage, cat: catalogue })
      .from(cataloguePage)
      .innerJoin(catalogue, eq(cataloguePage.catalogueId, catalogue.id))
      .where(eq(cataloguePage.id, input.pageId))
      .limit(1)
  )[0];
  if (!pageRow?.page.imageKey) return { ok: false, error: "page-not-found" };

  let buffer: Buffer;
  try {
    buffer = await readImage(pageRow.page.imageKey);
  } catch {
    return { ok: false, error: "image-unreadable" };
  }
  const mime = pageRow.page.imageKey.endsWith(".png")
    ? "image/png"
    : pageRow.page.imageKey.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  let raw;
  try {
    raw = await provider.analyzeImage({
      system: SYSTEM_PROMPT,
      prompt: "Extract the offers from this leaflet page.",
      imageDataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
      schema: z.object({ items: z.array(z.unknown()) }),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 200) : "ai-failed";
    // Record the failed attempt (retry cadence) but leave processedAt NULL
    // so the page stays eligible — the sweep retries after the cooldown.
    await db.insert(aiExtraction).values({
      kind: "catalogue_page",
      userId: input.userId,
      model: process.env.ZAI_VISION_MODEL ?? "glm-5.3-flash",
      promptVersion: "catalogue-v2",
      output: { pageId: input.pageId, items: [], error },
      validationStatus: "rejected",
    });
    return { ok: false, error };
  }

  const candidates = candidatesFromExtraction(raw);
  await db.insert(aiExtraction).values({
    kind: "catalogue_page",
    userId: input.userId,
    // Evidence is linked to the page photo via its storageKey (set at upload).
    model: process.env.ZAI_VISION_MODEL ?? "glm-5.3-flash",
    promptVersion: "catalogue-v2",
    output: { pageId: input.pageId, items: candidates },
    validationStatus: candidates.length > 0 ? "valid" : "rejected",
  });
  await db.update(cataloguePage).set({ processedAt: new Date() }).where(eq(cataloguePage.id, input.pageId));
  return { ok: true, candidates };
}

/** Cooldown between attempts on the same page: one retry per nightly run. */
export const RETRY_INTERVAL_MS = 25 * 60 * 60 * 1000;

/**
 * Retry-cadence predicate (pure, fixture-tested). A page is attempted when
 * it was never tried, or when the latest attempt failed and cooled down; a
 * recent attempt or a valid result shields it.
 */
export function shouldAttempt(lastAttemptAt: Date | null, lastValid: boolean, now: Date = new Date()): boolean {
  if (lastAttemptAt === null) return true;
  if (lastValid) return false;
  return now.getTime() - lastAttemptAt.getTime() >= RETRY_INTERVAL_MS;
}

/**
 * Nightly sweep over unprocessed pages (the pg-boss `page-extraction` job),
 * also fired manually from the admin view. Paid AI calls are bounded by the
 * budget guard; the kill-switch guards UNATTENDED automation only — a human
 * pressing the admin trigger (opts.manual) is attended by definition, so it
 * bypasses the switch and the failed-retry cooldown (valid results still
 * shield). The switch is read per invocation (inside this function, not at
 * import) so flipping `CATALOGUE_AUTO_EXTRACT` needs no restart. After the AI
 * phase, candidates passing the deterministic auto-confirm gate (plan 006)
 * are promoted; the rest stay review candidates on the catalogue page.
 * Every attended run is recorded as an ingestionRun row for the admin view.
 */
export async function runExtractionSweep(
  now: Date = new Date(),
  opts?: { manual?: boolean },
): Promise<{ extracted: number; skipped: number; failed: number; promoted: number }> {
  if (!opts?.manual && process.env.CATALOGUE_AUTO_EXTRACT !== "1") {
    return { extracted: 0, skipped: 0, failed: 0, promoted: 0 }; // kill-switch, default OFF
  }
  const provider = getAIProvider();
  if (!provider.configured) return { extracted: 0, skipped: 0, failed: 0, promoted: 0 };
  const parsedBudget = Number.parseInt(process.env.CATALOGUE_EXTRACT_BUDGET ?? "", 10);
  const budget = Number.isFinite(parsedBudget) && parsedBudget >= 0 ? parsedBudget : 20; // pages per run

  // Observable in the admin ingestion view: one run row per attended sweep.
  const run = (
    await db
      .insert(ingestionRun)
      .values({
        source: opts?.manual ? "page-extraction (manual)" : "page-extraction",
        kind: "catalogue_ingestion",
        status: "running",
        stats: {},
        warnings: [],
      })
      .returning()
  )[0]!;
  const failureNotes: string[] = [];
  // Same two-tier gate as catalogue-sync and the Offers page: store-keyed
  // catalogues of user-enabled stores, national ones of retailers with any
  // enabled store (matchesScope keeps the rule in one pure place).
  const enabled = await db
    .select({ storeId: store.id, retailerId: store.retailerId })
    .from(userStorePrefs)
    .innerJoin(store, eq(userStorePrefs.storeId, store.id))
    .where(eq(userStorePrefs.enabled, true));
  const enabledStoreIds = new Set(enabled.map((row) => row.storeId));
  const enabledRetailerIds = new Set(enabled.flatMap((row) => (row.retailerId ? [row.retailerId] : [])));

  // Pages needing work: unprocessed, with an image, newest catalogues first.
  // The set is small in practice — the sync's politeness budgets cap it
  // (3 catalogues × 12 pages per store per run).
  const pages = await db
    .select({
      pageId: cataloguePage.id,
      catalogueId: catalogue.id,
      storeId: catalogue.storeId,
      retailerId: catalogue.retailerId,
    })
    .from(cataloguePage)
    .innerJoin(catalogue, eq(cataloguePage.catalogueId, catalogue.id))
    .where(and(isNull(cataloguePage.processedAt), isNotNull(cataloguePage.imageKey)))
    .orderBy(desc(catalogue.validFrom));

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  let attempted = 0;
  const successes: { catalogueId: string; pageId: string; candidates: CatalogueCandidate[] }[] = [];
  for (const page of pages) {
    if (attempted >= budget) break;
    if (!matchesScope(page, enabledStoreIds, enabledRetailerIds)) continue;

    // Retry cadence: the LATEST attempt shields the page for 25h; a valid
    // result shields it for good.
    const last = (
      await db
        .select({ createdAt: aiExtraction.createdAt, validationStatus: aiExtraction.validationStatus })
        .from(aiExtraction)
        .where(
          and(
            eq(aiExtraction.kind, "catalogue_page"),
            // jsonb filter — same shape as getPageCandidates.
            sql`${aiExtraction.output}->>'pageId' = ${page.pageId}`,
          ),
        )
        .orderBy(desc(aiExtraction.createdAt))
        .limit(1)
    )[0];
    const lastValid = last?.validationStatus === "valid";
    // Manual runs retry recent failures immediately; valid results still shield.
    const lastAttempt = lastValid || !opts?.manual ? (last?.createdAt ?? null) : null;
    if (!shouldAttempt(lastAttempt, lastValid, now)) {
      skipped += 1;
      continue;
    }
    attempted += 1;
    const result = await runPageExtraction({ pageId: page.pageId, userId: null });
    if (result.ok) {
      extracted += 1;
      if (result.candidates && result.candidates.length > 0) {
        successes.push({ catalogueId: page.catalogueId, pageId: page.pageId, candidates: result.candidates });
      }
    } else {
      failed += 1;
      const note = `${page.pageId.slice(0, 8)}: ${(result.error ?? "unknown").slice(0, 120)}`;
      failureNotes.push(note);
      console.error(`[page-extraction] ${note}`);
    }
  }

  // Auto-confirm phase: candidates whose signals are strictly deterministic
  // (printed price + printed date + EXACT product match) become promotions
  // without a human tap — see auto-confirm.ts for the gate and the
  // insert-then-check route. One product-catalog load for the whole batch.
  let promoted = 0;
  if (successes.length > 0) {
    const productCandidates = await loadProductCandidates();
    for (const { catalogueId, pageId, candidates } of successes) {
      for (const candidate of candidates) {
        try {
          const result = await promoteCandidate(candidate, { catalogueId, pageId }, productCandidates);
          if (result.ok && !result.duplicate) promoted += 1;
        } catch (err) {
          console.error(
            `[page-extraction] promote ${pageId}/${String(candidate.index)}: ${
              err instanceof Error ? err.message.slice(0, 120) : "failed"
            }`,
          );
        }
      }
    }
  }

  await db
    .update(ingestionRun)
    .set({
      status: failed > 0 ? "partial" : "succeeded",
      finishedAt: new Date(),
      stats: { extracted, skipped, failed, promoted, attempted, budget, manual: opts?.manual ? 1 : 0 },
      warnings: failureNotes.slice(0, 5),
    })
    .where(eq(ingestionRun.id, run.id));
  return { extracted, skipped, failed, promoted };
}
