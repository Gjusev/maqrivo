# Plan 011: Perf & data quality — SQL aggregates, junk-filter anchoring, timezone-safe dates

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/optimization/planner.ts apps/web/src/server/receipts/actions.ts apps/web/src/server/ingestion/promotions.ts apps/web/src/server/receipts/extraction.ts apps/web/src/server/catalogues/extraction.ts apps/web/src/server/recipes/actions.ts`
> Mismatch vs "Current state" = STOP. Plans 002/003/006 touch several of these — always
> re-read live code first.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (serialize with 002 on planner.ts)
- **Category**: perf + bug
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Growth-killers and small data-corruption bugs: the planner loads EVERY price observation
into memory to pick the latest per pair; product matching scans 500 products per
promotion (a 60-item confirm-all = 60 scans); the receipts page loads all receipt lines
to count them; the receipt junk filter matches substrings so real groceries die
(BONBON contains "bon", CARTON contains "carte", DATTE contains "date"); the leaflet
year inference uses MMDD integer arithmetic (31/12 vs 01/01 differ by 1130 despite one
day) on server-local time (UTC container vs French leaflets).

## Current state (verified)

- `apps/web/src/server/optimization/planner.ts:326-333`:
  ```ts
  const observations = await db.select().from(priceObservation).orderBy(desc(priceObservation.observedAt));
  // in-memory loop picking latest per `${productId}:${storeId}`
  ```
- `apps/web/src/server/ingestion/promotions.ts:97`:
  ```ts
  const products = await db.select().from(product).limit(500);
  ```
  inside the per-promotion matcher (`tryMatchPromotionProduct`).
- `apps/web/src/server/receipts/actions.ts:270-276` — `listReceipts` selects ALL
  `receiptLine` rows to `counts.filter(...)` per receipt; `suggestProductForLabel`
  (:43-47) loads 500 products per label.
- `apps/web/src/server/receipts/extraction.ts:34-55` — `JUNK_LABEL` alternation tested
  with unanchored `.test()` (read live; words include bon/carte/date/point variants).
- `apps/web/src/server/catalogues/extraction.ts:96-101` (verified):
  ```ts
  const now = new Date();
  const candidate = Number(now.getFullYear());
  const diff = Number(month) * 100 + Number(day) - (Number(String(now.getMonth() + 1).padStart(2, "0")) * 100 + now.getDate());
  year = String(diff < -630 ? candidate + 1 : candidate);
  ```
- `apps/web/src/server/recipes/actions.ts:118-125` — duplicate loads 200 recipes then
  `.find()` by id (recipes past the cap 404).
- Postgres 17 → `DISTINCT ON` available via drizzle `sql` templates.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/optimization/planner.ts` (latest-price query only)
- `apps/web/src/server/ingestion/promotions.ts` (matcher product load)
- `apps/web/src/server/receipts/actions.ts` (line counts, suggestion load)
- `apps/web/src/server/receipts/extraction.ts` (junk anchoring)
- `apps/web/src/server/catalogues/extraction.ts` (year inference)
- `apps/web/src/server/recipes/actions.ts` (duplicate lookup)
- `apps/web/test/extraction.test.ts`, `apps/web/test/receipts-junk.test.ts` (create or extend)

**Out of scope**:
- Multi-unit planner support (rejected section of plans/README.md).
- Any UI change.
- Index additions (verify query plans first; note candidates in the commit message).

## Git workflow

- Branch: `advisor/011-perf-data-quality`
- Commit: `SQL aggregates for latest-price/counts, anchored junk filter, timezone-safe year inference`

## Steps

### Step 1: Latest price per pair in SQL

Replace the full `priceObservation` load (planner.ts:326-333) with a DISTINCT ON query:

```ts
  const observations = await db.execute(sql`
    SELECT DISTINCT ON (product_id, store_id) *
    FROM price_observation
    ORDER BY product_id, store_id, observed_at DESC
  `);
```

Map the rows into the same `priceByProductStore` shape the loop built (mind snake_case
column keys from raw SQL vs drizzle's camelCase mapping — normalize explicitly). Keep
the `freshnessOf` logic untouched downstream.

**Verify**: `pnpm typecheck` → exit 0; `pnpm --filter @maqrivo/web test` → pass.

### Step 2: Product matcher loads once per call site

In `promotions.ts`, hoist the 500-product load: `tryMatchPromotionProduct` should accept
an optional pre-loaded `products` array (module-level per-invocation caching is NOT
wanted — serverless-ish runtime). Then in `confirmAll`'s server path (plan 003's
confirmCandidateAction loop) load once and pass through. Simpler acceptable variant:
export `tryMatchPromotionProductBatch(promotions, products)` used by the confirm path,
keeping the single-promotion signature for the manual path. Read the live callers first
(grep `tryMatchPromotionProduct(`) and keep them all working.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Receipt line counts + suggestions

- `listReceipts`: replace the all-lines load with
  `SELECT receipt_id, COUNT(*) FROM receipt_line GROUP BY receipt_id` (drizzle
  `sql` or `count()` + `groupBy`), build a Map, index it.
- `suggestProductForLabel`: keep its 500 cap but select only the columns used
  (id, name/brand fields — read the function) to cut payload.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Anchor the junk filter

In `receipts/extraction.ts`, rewrite `JUNK_LABEL` as word-anchored alternatives:
`^(?:bon|carte|date|point|...)$` against the normalized token(s) of the label — read the
current matching code first and preserve its case-insensitivity and any existing
normalization. The rule: a label is junk only when a junk word appears as a WHOLE token
(split label on whitespace/punctuation before testing), never as a substring.

**Verify**: new tests (Step 6) pass.

### Step 5: Timezone-safe year inference

In `catalogues/extraction.ts` `parsePrintedDate` (:86-103), replace the MMDD arithmetic
with real date distance in a fixed timezone:

```ts
  if (year === null) {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
    const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
    const nowParis = new Date(Date.UTC(y, m - 1, d));
    const candidate = new Date(Date.UTC(y, Number(month) - 1, Number(day)));
    const dayDiff = (candidate.getTime() - nowParis.getTime()) / 86_400_000;
    year = String(dayDiff < -183 ? y + 1 : y);
  }
```

(183 ≈ the 6-month policy the comment already states; en-CA yields YYYY-MM-DD.)

**Verify**: `pnpm --filter @maqrivo/web test` → extraction tests pass (add cases below).

### Step 6: Tests

- Extend `apps/web/test/extraction.test.ts` (parsePrintedDate): "31/12" on a fake
  now of Jan 2 → next year; "01/01" on Dec 30 → current year... NOTE: the function reads
  the real clock. Refactor for testability: optional second parameter
  `parsePrintedDate(value, now = new Date())` — then the cases are deterministic. Keep
  the default so existing callers are untouched.
- Create `apps/web/test/receipts-junk.test.ts`: "BONBON" / "CARTON DE 6" / "DATTE" /
  "POIREAUX" survive; "BON" / "CARTE BANCAIRE" / "DATE" / "POINTS FIDELITE" are junk.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, ≥8 new cases.

### Step 7: Recipe duplicate lookup

In `recipes/actions.ts:118-125`, replace the 200-cap scan with a direct
`.where(and(eq(recipe.id, recipeId), or(eq(recipe.ownerUserId, session.userId),
isNull(recipe.ownerUserId))))` select.

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

## Test plan

Step 6 enumerates the new cases; the planner/count changes are shape-preserving and
covered by typecheck + existing suites.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0 (≥8 new cases)
- [ ] `grep -c "DISTINCT ON" apps/web/src/server/optimization/planner.ts` → 1
- [ ] `grep -n "limit(200)" apps/web/src/server/recipes/actions.ts` → no matches
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts (planner.ts especially, after 002).
- The raw-SQL row shape from `db.execute` differs from expectations badly enough that
  normalization would obscure freshness logic (report the shape you got).
- `parsePrintedDate` has callers passing a second arg already (grep first).

## Maintenance notes

- Note in the commit message any missing index implied by the new queries
  (price_observation(product_id, store_id, observed_at) is the obvious candidate —
  verify with `EXPLAIN` in dev before adding; drizzle migration is `pnpm db:generate`).
- The junk-word list is French-retailer-specific — grows with real receipts; keep it
  anchored forever.
