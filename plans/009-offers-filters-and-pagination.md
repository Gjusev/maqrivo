# Plan 009: Offers "my stores" filter + list pagination/counts

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- "apps/web/src/app/[locale]/(app)/offers" apps/web/src/server/ingestion/promotions.ts "apps/web/src/app/[locale]/(app)/products/page.tsx" "apps/web/src/app/[locale]/(app)/recipes/page.tsx"`
> Mismatch vs "Current state" = STOP. Plans 001/003 touch the offers tree.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED (the my-stores scoping decision changes what the offers page IS)
- **Depends on**: none
- **Category**: ux
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

The offers page lists promotions globally with no store/retailer filter, so it mixes every
retailer in the system — noise the owner must mentally skip. The catalogue list is capped
at `limit(10)` with no overflow indicator (older catalogues become unreachable from the
UI), promotions at 100, products at 100 — all silent truncation. Products and recipes have
no search at all. This plan adds a "my stores" default scoping with an all-stores toggle,
catalogue metadata badges, and honest counts + simple search where cheap.

## Current state

- `apps/web/src/server/ingestion/promotions.ts:162-177` — `listActivePromotions()` takes
  no arguments: all active promotions, all retailers, `.limit(100)` (read live).
- Offers page (`offers/page.tsx`, verified structure): renders catalogues section
  (`limit(10)` at :37) then the promotions list; no filters.
- Products page `products/page.tsx:24` — `.limit(100)`; recipes `recipes/page.tsx:20-28` —
  unbounded. A client-side search pattern already exists: `stores/nearby-stores.tsx`
  (searchable nearby list — read for the debounce/filter pattern).
- `userStorePrefs` table: per-user enabled stores (used by catalogue-sync's two-tier gate).
- i18n: `apps/web/messages/{en,fr}.json` (`Offers`, `Catalogues`, `Products`, `Recipes`
  namespaces exist).

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/ingestion/promotions.ts` (scoped variant)
- `apps/web/src/app/[locale]/(app)/offers/page.tsx` + a new `offers/filter-bar.tsx` (client)
- `apps/web/src/app/[locale]/(app)/offers/catalogues/page.tsx` (create — full catalogue list)
- `apps/web/src/app/[locale]/(app)/products/page.tsx`, `recipes/page.tsx` (search + counts)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`
- `apps/web/test/offers-scope.test.ts` (create, pure parts)

**Out of scope**:
- Server-side pagination infrastructure (URL searchParams + SQL offset) — counts + "show
  all" links + client search cover today's data volumes; revisit at >500 rows.
- Changing the promotion data model or dedup (plans 003/006).

## Git workflow

- Branch: `advisor/009-offers-filters`
- Commit: `Offers my-stores filter, catalogue list page, honest counts + search`

## Steps

### Step 1: Scoped promotion listing

In `promotions.ts`, extend `listActivePromotions` with an options object (keep the
no-arg call working for other callers — grep them first):

```ts
export async function listActivePromotions(options?: {
  userId?: string;
  scope?: "enabled-stores" | "all";
}): Promise<...>
```

When `scope === "enabled-stores"` and `userId` present: left-join promotions through
`store` → `userStorePrefs` (enabled) — keep a promotion when its storeId is enabled OR
(storeId IS NULL AND its retailer has ANY enabled store — the two-tier shape from
catalogue-sync.ts:284-300). Keep the existing `.limit(100)` but ALSO return
`total: number` via a sibling count query so the UI can show "showing 100 of N".

**Verify**: `pnpm typecheck` → exit 0; `grep -rn "listActivePromotions(" apps/web/src --include=*.tsx --include=*.ts | wc -l` → same caller count as before (signature backward-compatible).

### Step 2: Filter bar on the offers page

Create `offers/filter-bar.tsx` (client): two chip-style toggles — "My stores" (default
active) / "All" — that set the URL searchParam `scope` via the i18n router
(`useRouter().push("/offers?scope=all")`; read the param server-side in page.tsx with
`searchParams`). Style: `rounded-full border px-3 py-1 text-xs` with active state
`border-brand-600 text-brand-700 bg-brand-50`. Keys `Offers.scopeMine` (en "My stores" /
fr "Mes magasins"), `Offers.scopeAll` (en "All" / fr "Tous").

Pass `session.userId` + scope into `listActivePromotions`; render `total` as
"≥100+" style hint when truncated (`Offers.showingOf`: en "showing {shown} of {total}" /
fr "{shown} sur {total}").

**Verify**: dev render `/fr/offers` and `/fr/offers?scope=all` differ; `pnpm lint` → exit 0.

### Step 3: Full catalogue list page + badges

- Create `offers/catalogues/page.tsx` (server): all catalogues joined to retailer (same
  query as offers/page.tsx:31-37 minus the limit, plus a `cataloguePage` count via a
  grouped subquery or a second count query — keep it to two queries), ordered by
  `validUntil DESC NULLS LAST, createdAt DESC`. Each row: title, retailer, validity,
  page-count badge, and an `expired` pill when `validUntil < today` (sorted last).
- Offers page catalogue section: keep `limit(10)` but append a "view all (N)" link to
  `/offers/catalogues` when more exist (`Offers.viewAllCatalogues`: en "All catalogues ({count})" /
  fr "Tous les prospectus ({count})").
- Add a back link to `/offers` on the new page (pattern from plan 004).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Search + counts on products and recipes

- Products page: client-side filter input above the list filtering the server-rendered
  rows by name substring (uppercase compare), modeled on `nearby-stores.tsx`'s search.
  Show `Products.showingOf` count hint. Keep `.limit(100)`.
- Recipes page: same treatment (client filter; list currently unbounded — add
  `.limit(200)` for symmetry and the count hint).

**Verify**: `pnpm lint` → exit 0; manual dev: typing in the box filters rows.

### Step 5: Tests

`apps/web/test/offers-scope.test.ts` — if the two-tier predicate is factored as a pure
function (recommended: `matchesScope(promotion: { storeId: string | null; retailerId: string }, enabledStoreIds: Set<string>, enabledRetailerIds: Set<string>): boolean`),
test: enabled store matches; foreign store doesn't; national promo of enabled retailer
matches; national promo of disabled retailer doesn't. Otherwise source-drift asserts on
the filter-bar wiring.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, ≥4 new cases.

## Test plan

Covered in Step 5; manual dev checks in Steps 2/4.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `/fr/offers?scope=all` shows ≥ the default view's promotions (dev check)
- [ ] `offers/catalogues/page.tsx` exists and renders with badges
- [ ] Both message files contain `Offers.scopeMine/scopeAll/viewAllCatalogues/showingOf`,
      `Products.showingOf`, `Recipes.showingOf`
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- The promotions query's joins can't express the two-tier scope in drizzle without raw
  SQL (raw `sql` template is acceptable; if even that fails, report).

## Maintenance notes

- The scope default ("my stores") is a product decision encoded here — if the owner
  prefers all-stores default, flip the chip's initial state and the server default.
- When promotions exceed a few hundred rows, replace client search with searchParams +
  SQL ILIKE (the filter-bar already owns the URL state).
