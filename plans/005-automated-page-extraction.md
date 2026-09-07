# Plan 005: Automated vision extraction — pg-boss sweep over unprocessed pages

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/jobs/queue.ts apps/web/src/server/catalogues/actions.ts apps/web/src/instrumentation.ts`
> Mismatch vs "Current state" = STOP. Plans 002/003 also touch catalogues/actions.ts —
> re-read the live file before editing.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (unattended paid AI calls — bounded by the budget guard this plan adds)
- **Depends on**: 001 (pages must be stored), 003 (candidates must be hydratable)
- **Category**: direction (automation)
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Today the vision extraction — reading offers out of leaflet page photos — is reachable
ONLY through a per-page manual button. For a 12-page leaflet that's 12 taps of waiting;
miss one and the data never lands. Meanwhile the daily catalogue-sync (06:09) already
stores new page images with `processedAt: null` and never touches them again. This plan
turns extraction into a queued background job that sweeps unprocessed pages nightly, with
a hard budget cap and a kill-switch, keeping the human "confirm" gate intact (plan 006
relaxes that gate for high-signal candidates only).

## Current state

- `apps/web/src/server/jobs/queue.ts` (verified, whole file read): pg-boss worker started
  from `apps/web/src/instrumentation.ts` (server runtime only). Three queues +
  schedules:

```ts
const JOBS = ["promotion-expiry", "openprices-sync", "catalogue-sync"] as const;
// ...
  await boss.schedule("promotion-expiry", "17 5 * * *");
  await boss.schedule("openprices-sync", "43 5 * * *");
  await boss.schedule("catalogue-sync", "09 6 * * *");
```

  Jobs run via a `runJob(name)` switch. Manual trigger: `triggerJob(name)` used by
  `/admin/ingestion`.

- `apps/web/src/server/catalogues/actions.ts:58-118` — `extractPageAction(pageId)`: session-
  required; reads the image via `readImage`, calls `provider.analyzeImage` with the
  catalogue-v2 system prompt, `candidatesFromExtraction`, inserts an `aiExtraction` row
  (`kind: "catalogue_page"`, `userId: session.userId`, `output: { pageId, items }`), sets
  `cataloguePage.processedAt = new Date()`.
- `apps/web/src/server/ingestion/catalogue-sync.ts:149-150` — changed pages get
  `processedAt: null` (the natural "needs extraction" marker; nothing reads it yet).
- `provider.ts` — `getAIProvider().configured` is false when `ZAI_API_KEY` is absent
  (compose.prod.yaml defaults it to empty).
- `cataloguePage` has `catalogueId`, `pageNumber`, `imageKey`, `contentHash`,
  `processedAt`, `sourceUrl` columns (schema `packages/db/src/schema/promotions.ts`).

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/catalogues/extraction-runner.ts` (create)
- `apps/web/src/server/jobs/queue.ts`
- `apps/web/src/server/catalogues/actions.ts` (refactor to reuse the runner)
- `apps/web/src/app/[locale]/admin/ingestion/actions.ts` (trigger enum + fallback)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json` (admin labels, if the admin page lists job names)
- `apps/web/test/extraction-runner.test.ts` (create)

**Out of scope**:
- Auto-confirmation of candidates (plan 006).
- Changing the vision prompt or model defaults.
- Upload-route-triggered immediate extraction (keep uploads manual-extract; the nightly
  sweep covers them too via `processedAt IS NULL`).

## Git workflow

- Branch: `advisor/005-auto-extraction`
- Commit: `Automated page extraction: pg-boss sweep with budget cap and kill-switch`

## Steps

### Step 1: Extract the runner

Create `apps/web/src/server/catalogues/extraction-runner.ts` with the core lifted from
`extractPageAction` (actions.ts:58-118), parameterized:

```ts
export interface ExtractPageResult {
  ok: boolean;
  error?: string;
  candidates?: CatalogueCandidate[];
}

export async function runPageExtraction(input: {
  pageId: string;
  userId: string | null; // null = system job
}): Promise<ExtractPageResult>
```

Rules:
- Do NOT require a session (the job has none). Keep every other behavior identical:
  image read, mime detection, provider call (same system prompt string — move it here
  verbatim), `candidatesFromExtraction`, `aiExtraction` insert (`userId: input.userId`),
  `processedAt` update. On AI failure, still set `processedAt`? NO — leave null so the
  next sweep retries (but respect the retry cap in step 2's query: also stamp a
  `extractionAttempts` count? The column doesn't exist — instead, on failure insert the
  `aiExtraction` row with `validationStatus: "rejected"` and an `output.error` string, and
  have the sweep skip pages whose LATEST extraction row is recent (< 25h) — retry cadence
  becomes daily, no schema change).
- `extractPageAction` becomes a thin wrapper: session check →
  `runPageExtraction({ pageId, userId: session.userId })`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm --filter @maqrivo/web test` → existing
extraction tests still pass.

### Step 2: The sweep job

In `queue.ts`:
- Add `"page-extraction"` to `JOBS`.
- Handler in `runJob`:

```ts
  } else if (name === "page-extraction") {
    const r = await runExtractionSweep();
    console.log(`[job] page-extraction: ${String(r.extracted)} extracted / ${String(r.skipped)} skipped / ${String(r.failed)} failed`);
  }
```

- Schedule AFTER catalogue-sync: `await boss.schedule("page-extraction", "41 6 * * *");`
  (off-minute per policy).
- `runExtractionSweep` lives in `extraction-runner.ts`:

```ts
export async function runExtractionSweep(): Promise<{ extracted: number; skipped: number; failed: number }> {
  if (process.env.CATALOGUE_AUTO_EXTRACT !== "1") return { extracted: 0, skipped: 0, failed: 0 }; // kill-switch, default OFF
  const provider = getAIProvider();
  if (!provider.configured) return { extracted: 0, skipped: 0, failed: 0 };
  const budget = Number(process.env.CATALOGUE_EXTRACT_BUDGET ?? 20); // pages per run

  // Pages needing work: processedAt IS NULL, no successful extraction row, latest
  // attempt older than 25h, belonging to a catalogue whose store is user-enabled
  // (join store → userStorePrefs.enabled, or storeId IS NULL national catalogues
  // of retailers with any enabled store — mirror the two-tier gate from
  // catalogue-sync.ts:284-300).
  // ... select at most `budget` pages ordered by catalogue validFrom DESC ...
```

  For each page: `runPageExtraction({ pageId, userId: null })`, count outcomes, continue
  on individual failure. Write a console line per page failure with the error's first 120
  chars.

- `.env.example`: document both vars (`CATALOGUE_AUTO_EXTRACT=0`,
  `CATALOGUE_EXTRACT_BUDGET=20`).

**Verify**: `pnpm typecheck` → exit 0. `grep -n "page-extraction" apps/web/src/server/jobs/queue.ts` → ≥3 hits (JOBS, schedule, handler).

### Step 3: Admin trigger surface

In `admin/ingestion/actions.ts` extend the `job` union with `"page-extraction"` and add
the inline-fallback branch (`const { runExtractionSweep } = await import(...)`). Check
`admin/ingestion/page.tsx` + `trigger-button.tsx` for a job list to extend and any labels
to add to both message files.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Tests

`apps/web/test/extraction-runner.test.ts` — pure pieces only:
- The skip-predicate: given a fabricated extraction-row history (latest attempt 1h ago →
  skip; 30h ago → retry; validationStatus "valid" → skip), classify correctly. Export the
  predicate as a small pure function `shouldAttempt(lastAttempt: Date | null, lastValid: boolean): boolean`
  from the runner so it's testable.
- Kill-switch: assert `runExtractionSweep()` short-circuits when
  `CATALOGUE_AUTO_EXTRACT !== "1"` — testable without DB only if the guard runs before any
  import-time DB access; if `db` is imported at module top, restructure the guard into the
  exported function and test the guard helper instead.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass with the new file.

## Test plan

Covered in Step 4. The end-to-end job needs a live AI key + DB — verify manually in dev:
set `CATALOGUE_AUTO_EXTRACT=1`, upload a leaflet page, hit the admin trigger, reload the
catalogue detail: candidates appear WITHOUT tapping Extract (via plan 003's hydration).

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -n "CATALOGUE_AUTO_EXTRACT" apps/web/src/server/catalogues/extraction-runner.ts .env.example` → hits in both
- [ ] `grep -c "runPageExtraction" apps/web/src/server/catalogues/actions.ts` → exactly 1 (the wrapper call)
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts (especially actions.ts after plans 002/003).
- The enabled-store join for pages can't be expressed without touching schema (report the
  exact query you need).
- The AI provider interface lacks a way to distinguish quota/auth failures from parse
  failures (check `provider.ts` error classes; if indistinguishable, treat ALL as retryable
  with the 25h cadence and note it).

## Maintenance notes

- Default OFF (`CATALOGUE_AUTO_EXTRACT=0`) until the owner opts in after seeing costs —
  the deploy env must set it explicitly. One page ≈ one vision call; budget 20/night.
- Plan 006 consumes this job's output for auto-confirm — keep the `aiExtraction` row
  shape (`output.pageId`, `output.items`) stable.
- Reviewer: the kill-switch check must run INSIDE `runExtractionSweep` (per-invocation),
  not at import time, so flipping the env var needs no restart.
