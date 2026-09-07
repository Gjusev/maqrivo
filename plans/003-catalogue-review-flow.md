# Plan 003: Catalogue review flow — hydrate candidates, dedup, visible errors, tap guards

> **Executor instructions**: Follow step by step; verify each step before the next.
> STOP conditions halt the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/catalogues/actions.ts "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx" "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page.tsx"`
> Mismatch vs "Current state" = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (soft — this plan matters most once synced pages exist)
- **Category**: bug + ux
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

The owner's #2 complaint is "I can't select them". Three verified causes, all in the
candidate-review flow: (a) extraction candidates live only in client state — reload and
they're gone, forcing a re-paid AI call, and "confirm all" after re-extraction inserts
duplicate promotions; (b) `confirm()`/`addToBasket()` have no `else` branch, so typed
server errors (`no-enabled-store`, `price-required`) render as dead buttons; (c) no
double-tap guard means rapid taps insert duplicate promotions. This plan makes the flow
survive reloads, show every failure, and stay idempotent under fast tapping.

## Current state

- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx` (verified):
  - :50 `const [candidates, setCandidates] = useState<CatalogueCandidate[] | null>(null);`
    — nothing hydrates persisted candidates on mount.
  - :82-101 `confirm()` — `if (result.ok && result.promotionId) { ... }` with no else.
  - :104-112 `confirmAll()` — sequential loop, per-candidate `router.refresh()` inside
    `confirm()` (N refreshes).
  - :114-122 `addToBasket()` — `if (result.ok)` with no else; no pending guard.
- `apps/web/src/server/catalogues/actions.ts:121-135` — `getPageCandidates(pageId)` is
  exported but has ZERO callers (dead code, grep-verified). It scans the latest 50
  `aiExtraction` rows and JS-matches `output.pageId`:
  ```ts
  const rows = await db.select().from(aiExtraction)
    .where(eq(aiExtraction.kind, "catalogue_page"))
    .orderBy(desc(aiExtraction.createdAt)).limit(50);
  const row = rows.find((r) => (r.output as { pageId?: string } | null)?.pageId === pageId);
  ```
  `aiExtraction.output` is **jsonb** (`packages/db/src/schema/ops.ts:34`) so a SQL filter is
  possible without migration. Note: `getPageCandidates` has NO session check (fixed in plan
  010 — do not duplicate that here; this plan only changes its query + gives it a caller).
- `actions.ts:152-211` `confirmCandidateAction` inserts unconditionally; the promotion
  table has no unique constraint on natural keys (verified: plain indexes only).
- The detail page (`[id]/page.tsx:64-73`) already queries `promos` per catalogue — enough
  to derive `confirmedCount` but not which candidate indexes are confirmed (candidates
  aren't rows). Client-side `confirmed` map keyed by candidate index is the existing
  mechanism — keep it.
- i18n files: `apps/web/messages/{en,fr}.json`, namespace `"Catalogues"` and `"Errors"`.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/catalogues/actions.ts`
- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx`
- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page.tsx`
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`
- `apps/web/test/catalogue-confirm.test.ts` (create)

**Out of scope**:
- Auth/ownership hardening of these actions (plan 010).
- Automating extraction (plan 005) or confirmation (plan 006).
- Schema changes / unique indexes (rejected — see plans/README.md).

## Git workflow

- Branch: `advisor/003-review-flow`
- Commit: `Catalogue review flow: hydrate persisted candidates, dedup confirms, visible errors`

## Steps

### Step 1: SQL-level getPageCandidates + server-side hydration

In `actions.ts`, rewrite `getPageCandidates` to filter in SQL (drizzle `sql` template on
the jsonb path) and hydrate it from the detail page:

```ts
import { sql } from "drizzle-orm";
// ...
export async function getPageCandidates(pageId: string): Promise<CatalogueCandidate[]> {
  const rows = await db
    .select()
    .from(aiExtraction)
    .where(and(eq(aiExtraction.kind, "catalogue_page"), sql`${aiExtraction.output}->>'pageId' = ${pageId}`))
    .orderBy(desc(aiExtraction.createdAt))
    .limit(1);
  const out = rows[0]?.output as { items?: CatalogueCandidate[] } | null | undefined;
  return out?.items ?? [];
}
```

In `[id]/page.tsx`, pass candidates into each card (one query per page is fine at ≤12
pages; batch with `Promise.all` if you prefer):

```tsx
          pages.map(async (page) => (
            <PageCard
              key={page.id}
              /* existing props */
              initialCandidates={await getPageCandidates(page.id)}
            />
          ))
```

(If the async-map-in-JXS pattern trips lint, resolve the array before `return`:
`const candidatesByPage = await Promise.all(pages.map((p) => getPageCandidates(p.id)));`
and index it in the map — prefer this form.)

In `page-card.tsx`: accept `initialCandidates?: CatalogueCandidate[]` and initialize
`useState<CatalogueCandidate[] | null>(initialCandidates ?? null)`. When non-empty on
mount, ALSO apply the printed-date preference logic currently inside `extract()` (lines
67-74) so `validUntil` pre-fills — extract that shared snippet into a small
`applyPrintedDates(list)` helper used by both paths.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Dedup guard in confirmCandidateAction

In `actions.ts` `confirmCandidateAction`, before the insert (:176), add a natural-key
pre-check and return a distinct outcome:

```ts
  const duplicate = (
    await db
      .select({ id: promotion.id })
      .from(promotion)
      .where(
        and(
          eq(promotion.cataloguePageId, d.pageId),
          eq(promotion.descriptionRaw, d.description),
          d.promoPriceCents != null ? eq(promotion.promoPriceCents, d.promoPriceCents) : isNull(promotion.promoPriceCents),
        ),
      )
      .limit(1)
  )[0];
  if (duplicate) return { ok: true, promotionId: duplicate.id, duplicate: true };
```

Add `duplicate?: boolean` to the return type. (Client treats it as success — idempotent
confirm.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Visible errors + tap guards in page-card

In `page-card.tsx`:
- Add `const [actionError, setActionError] = useState<string | null>(null);` and
  `const [confirming, setConfirming] = useState<Record<number, boolean>>({});`.
- `confirm()`: set `confirming[candidate.index]` around the await; on `!result.ok` map the
  typed codes to messages and `setActionError(...)`:
  - `no-enabled-store` → new key `Catalogues.noEnabledStore` (en: "Enable a store of this
    retailer first — check /stores."; fr: "Activez d'abord une magasin de cette enseigne —
    voir /stores.")
  - `price-required` → new key `Catalogues.priceRequired` (en: "No readable price on this
    offer — skip it or edit the price."; fr: "Aucun prix lisible sur cette offre —
    ignorez-la ou corrigez le prix.")
  - anything else → existing `Errors.error`.
- `addToBasket()`: same treatment, disable its button while awaiting.
- Render `actionError` under the candidates header (reuse the `extractError` paragraph
  styling at :152).
- `confirmAll()`: disable the per-candidate Confirm buttons while `bulkPending` (pass
  `disabled={bulkPending || confirming[c.index]}` to them), and call `router.refresh()`
  ONCE after the loop instead of per-candidate (move it out of `confirm()` into the two
  call sites, or add a `skipRefresh` param — prefer the latter: `async function
  confirm(candidate, opts?: { skipRefresh?: boolean })`).
- Wire the `duplicate: true` result like a normal success (mark confirmed) — no special UI.

**Verify**: `pnpm lint` → exit 0; `pnpm typecheck` → exit 0.

### Step 4: Tests

Create `apps/web/test/catalogue-confirm.test.ts` (pure logic only — the repo has no DB test
harness; see `apps/web/test/extraction.test.ts` for style):
- Export nothing new from the component; instead test the two pure pieces this plan
  introduces if they land in `extraction.ts`/`actions.ts` as functions (the date-prefill
  helper `applyPrintedDates`): (a) picks the first non-null printed validUntil, (b) falls
  back to preserving an existing value, (c) 9-day heuristic when none.
- Assert (source-drift style, as plan 001 does) that `page-card.tsx` contains an
  `actionError` render and `initialCandidates` prop — one regex each.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass.

## Test plan

Covered in Step 4. Manual smoke (optional, needs dev env + seeded data): extract a page,
reload, confirm candidates appear without re-extracting; confirm twice → single promotion.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` all exit 0
- [ ] `grep -rn "getPageCandidates" apps/web/src --include=*.tsx` → ≥1 caller (the detail page)
- [ ] `grep -c "noEnabledStore" apps/web/messages/en.json apps/web/messages/fr.json` → 1 each
- [ ] `git status` shows only in-scope files; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- `aiExtraction.output` is not jsonb in the live schema (check `packages/db/src/schema/ops.ts:34`).
- The `sql` jsonb filter fails typecheck in a way drizzle 0.45 can't express (report; fall
  back to keeping the JS scan but move it server-side — do NOT keep limit(50) without
  filtering by userId, that's plan 010's lane).

## Maintenance notes

- Plan 005's sweep job writes candidates through the same `aiExtraction` row — hydration
  here is what surfaces them.
- Plan 006's auto-confirm must respect the same natural-key dedup (reuse the pre-check).
- Reviewer: the dedup key is intentionally narrow (same page + same description + same
  price); cross-catalogue duplicates are a separate finding (rejected for now).
