# Plan 001: Fetch leaflet pages for structured catalogues (fixes "empty catalogues")

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/ingestion/catalogue-sync.ts "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (adds remote image fetches for catalogues that previously skipped them — bounded by existing politeness caps)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

The owner's #1 complaint is "I can't open the catalogues". Root cause (verified): the daily
catalogue-sync ingests structured promo items and then `continue`s **before** the loop that
downloads page images, so every synced catalogue opens as an empty shell showing
"Aucun prospectus — photographiez le prospectus papier…" even though Lidl/Auchan/Intermarché
adapters computed page image URLs that were never fetched. After this plan, synced catalogues
contain their actual leaflet pages (browseable, extractable, selectable), and catalogues that
genuinely have no images (Monoprix/G20 structured-only) show an honest state instead of the
misleading "photograph it yourself" copy.

## Current state

- `apps/web/src/server/ingestion/catalogue-sync.ts` — remote catalogue ingestion. The bug,
  lines 103-113:

```ts
      if (rc.items.length > 0) {
        result.newPromotions += await ingestStructuredItems({
          retailerId: retailerRow.id,
          storeId: input.storeId,
          catalogueId: catRow.id,
          catalogue: rc,
        });
        continue;   // ← skips the page-image loop entirely
      }

      for (const [index, pageUrl] of rc.pageImageUrls.slice(0, MAX_PAGES_PER_CATALOGUE).entries()) {
```

- Adapter facts (verified): `lidl.ts:136`, `auchan.ts:212`, `intermarche.ts:180` populate
  BOTH `items` and `pageImageUrls`; `monoprix.ts:176` and `g20.ts:122` return
  `pageImageUrls: []` (structured-only — no images exist to fetch).
- Politeness caps already in force (lines 31-34): `MAX_CATALOGUES_PER_STORE = 3`,
  `MAX_PAGES_PER_CATALOGUE = 12`, `MAX_ITEMS_PER_CATALOGUE = 60`.
- The page-image loop (lines 113-157) is idempotent: content-hash dedup means unchanged
  pages are skipped (`result.unchangedPages += 1; continue;` at 130-134).
- Catalogue detail page `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page.tsx`,
  lines 61-62, renders the misleading empty state whenever `pages.length === 0` — even when
  `promos.length > 0` (structured promotions DO render below at lines 76-97):

```tsx
        {pages.length === 0 ? (
          <p className="card p-6 text-center text-sm text-zinc-500">{t("noCatalogues")}</p>
        ) : (
```

- i18n: keys live in `apps/web/messages/en.json` and `fr.json` under the `"Catalogues"`
  namespace. The empty-state key is `noCatalogues`.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                         | exit 0              |
| Lint      | `pnpm lint`                              | exit 0              |
| Tests     | `pnpm --filter @maqrivo/web test`        | all pass            |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/server/ingestion/catalogue-sync.ts`
- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page.tsx`
- `apps/web/messages/en.json`, `apps/web/messages/fr.json` (new keys only)
- `apps/web/test/catalogue-sync-branch.test.ts` (create — see Test plan)

**Out of scope** (do NOT touch):
- `apps/web/src/server/integrations/retailers/*` — adapters already return correct data.
- The AI extraction path (`catalogues/actions.ts`) — plan 005 handles automation there.
- `MAX_PAGES_PER_CATALOGUE` / `MAX_CATALOGUES_PER_STORE` values — politeness budget is policy (ADR-0005).
- Any schema/migration change.

## Git workflow

- Branch: `advisor/001-synced-catalogue-pages`
- One commit at the end; message style follows repo history, e.g.
  `Fix synced catalogues opening empty: fetch pages for structured sources too`

## Steps

### Step 1: Fetch pages for items-mode catalogues

In `syncRemoteCatalogues` (catalogue-sync.ts), remove the early `continue` so items
ingestion AND page fetching both run. Target shape:

```ts
      if (rc.items.length > 0) {
        result.newPromotions += await ingestStructuredItems({
          retailerId: retailerRow.id,
          storeId: input.storeId,
          catalogueId: catRow.id,
          catalogue: rc,
        });
        // Structured items and page images are complementary: pages are the
        // browse/evidence surface, items are the promotion data. Keep fetching
        // pages (Monoprix/G20 return none — the loop is a no-op for them).
      }

      for (const [index, pageUrl] of rc.pageImageUrls.slice(0, MAX_PAGES_PER_CATALOGUE).entries()) {
```

(Delete only the `continue;` line and the now-redundant `if` wrapping is kept — i.e. the
`if` block stays, the `continue` goes. The loop below runs for every catalogue.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Honest empty state when structured promos exist

In the catalogue detail page, differentiate "no pages AND no promos" (true empty → keep
`noCatalogues` copy) from "no pages but promos exist" (structured-only catalogue →
informational copy, not "photograph it yourself"). Target shape:

```tsx
        {pages.length === 0 ? (
          promos.length > 0 ? (
            <p className="card p-6 text-center text-sm text-zinc-500">{t("structuredOnly")}</p>
          ) : (
            <p className="card p-6 text-center text-sm text-zinc-500">{t("noCatalogues")}</p>
          )
        ) : (
```

Add to BOTH message files under `"Catalogues"`:
- en: `"structuredOnly": "This catalogue's offers come directly from the retailer's data — no page photos to browse."`
- fr: `"structuredOnly": "Les offres de ce prospectus proviennent directement des données de l'enseigne — pas de photos de pages à consulter."`

**Verify**: `grep -n "structuredOnly" apps/web/messages/en.json apps/web/messages/fr.json` → 1 hit each.

### Step 3: Regression test for the branch

Create `apps/web/test/catalogue-sync-branch.test.ts`. The sync function needs DB + network,
so test the observable contract instead: model after `apps/web/test/extraction.test.ts`
(pure-function vitest style). Two assertions:
1. For a `RemoteCatalogue` with items AND pageImageUrls, both paths must run — assert this
   by exporting nothing new: instead assert on the source file content that the `continue`
   between `ingestStructuredItems` and the page loop is gone (a drift-guard test reading
   the file and asserting `!/continue;\\n\\n      for \\(const \\[index, pageUrl\\]/` style
   regex). This is unconventional but cheap and guards exactly the regression that caused
   the bug; keep it to one focused regex test named "structured catalogues still fetch pages".
2. i18n guard: both message files parse and contain `structuredOnly` (mirrors the repo's
   MISSING_MESSAGE fragility).

**Verify**: `pnpm --filter @maqrivo/web test` → all pass including the new file.

## Test plan

- New file `apps/web/test/catalogue-sync-branch.test.ts` covering: (a) the source-level
  drift guard, (b) message-key presence in both locales.
- Pattern: copy the import/assert style of `apps/web/test/extraction.test.ts`.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @maqrivo/web test` exits 0 with the new test file
- [ ] `grep -n "continue;" apps/web/src/server/ingestion/catalogue-sync.ts | wc -l` → one
      fewer `continue` than before in the items branch (the loop-level `continue` statements
      at former lines 114/133 remain)
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpted code doesn't match (drift).
- Fetching pages for items-mode catalogues in a live dev run errors out repeatedly on a
  specific retailer (report which adapter — politeness/backoff may need retuning, which is
  out of scope).
- You find `ingestStructuredItems` mutates `rc.pageImageUrls` (it must not).

## Maintenance notes

- Plan 005 (automated extraction) sweeps newly-stored pages — landing 001 first is what
  makes that job useful for Lidl/Auchan/Intermarché.
- Daily sync will now download up to 12 images per new structured catalogue window; watch
  `[job] catalogue-sync:` log lines for `newPages` growth after deploy.
- Reviewer: confirm the deleted line is exactly the `continue` after `ingestStructuredItems`,
  not the ones inside the page loop (content-hash skip).
