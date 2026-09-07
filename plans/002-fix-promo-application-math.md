# Plan 002: Fix promotion application math (wildcard store fallback + discountPct)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> On any STOP condition, stop and report. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/optimization/planner.ts apps/web/src/server/catalogues/extraction.ts apps/web/src/server/catalogues/actions.ts "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx"`
> Mismatch vs "Current state" = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but serialize with plan 010 — both touch server code)
- **Category**: bug
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Two verified money-math bugs gut the app's core promise ("what should I buy, given real
promotions"):

1. **Store-less promotions never apply.** Catalogue-confirmed promotions usually have
   `storeId: null` (manual catalogues + national leaflets). The planner stores them under
   a `*:{productId}` key but only ever looks up `{productId}:{storeId}` — the wildcard is
   dead weight. The optimizer silently pays regular prices for exactly the deals the user
   extracted and confirmed.
2. **Percentage deals optimize to 0% off.** Nothing derives `discountPct` from "-30%"
   phrases; the Python solver defaults `pct` to 0 for PERCENTAGE_OFF, and the confirm UI
   even passes the *regular* price as the promo price fallback. "-30%" deals become no-ops.

## Current state

- `apps/web/src/server/optimization/planner.ts` — lines 341-376 (verified):

```ts
  const promoByProductStore = new Map<string, typeof promotion.$inferSelect>();
  for (const { match, promo } of matches) {
    if (match.state !== "EXACT" && match.state !== "PROBABLE") continue;
    if (promo.verification === "EXPIRED") continue;
    if (promo.validUntil && promo.validUntil < today) continue;
    if (!match.productId) continue;
    const key = promo.storeId ? `${match.productId}:${promo.storeId}` : `*:${match.productId}`;
    promoByProductStore.set(key, promo);
  }
  // ...
        let promoApplied: typeof promotion.$inferSelect | undefined = promoByProductStore.get(`${p.id}:${storeRow.store.id}`);
```

  The lookup at :359 has NO wildcard fallback. The loyalty gate follows at :361-366.

- `apps/web/src/server/catalogues/extraction.ts:116-141` — `classifyMechanism` regex-matches
  `/-\s*\d{1,3}\s*%/` for the PERCENTAGE_OFF branch but discards the number:

```ts
  if (/-\s*\d{1,3}\s*%/.test(phrase)) {
    return { mechanism: "PERCENTAGE_OFF", bundleQty: null };
  }
```

  `CatalogueCandidate` (lines 65-79) has no `discountPct` field.

- `apps/web/src/server/catalogues/actions.ts:137-149` — `confirmSchema` has no `discountPct`;
  the promotion insert (:176-202) never sets `discountPct`.

- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx:83` (verified):

```ts
  const promoPrice = candidate.promoPriceCents ?? candidate.regularPriceCents;
```

  A pct-only offer (promoPrice null) gets recorded at its FULL price as the "promo" price.

- Solver side already consumes the field: `solver/promotions.py:31-33` —
  `pct = promo.get("discountPct") or 0`. So persisting `discountPct` is the complete fix.
- The promotion table HAS a `discountPct` integer column (it is written by the manual
  promotion form — see `new-promotion-button.tsx` usage in offers UI).

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |
| Solver    | `pnpm solver:test`                | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/optimization/planner.ts`
- `apps/web/src/server/catalogues/extraction.ts`
- `apps/web/src/server/catalogues/actions.ts`
- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx`
- `apps/web/test/extraction.test.ts` (extend)

**Out of scope**:
- `solver/` Python code (it already handles discountPct correctly).
- The `promotionDealAssessments` history logic (`server/prices/history.ts`).
- Any UI redesign of the candidate cards.

## Git workflow

- Branch: `advisor/002-promo-math`
- Commit message: `Fix promo math: wildcard store fallback in planner + derive discountPct`

## Steps

### Step 1: Wildcard fallback in the planner

In `planner.ts`, replace the single lookup at :359 with a two-step lookup — exact
product+store first, then the store-less wildcard:

```ts
        let promoApplied: typeof promotion.$inferSelect | undefined =
          promoByProductStore.get(`${p.id}:${storeRow.store.id}`) ??
          promoByProductStore.get(`*:${p.id}`);
```

The existing loyalty gate at :361-366 then applies to whichever promo was found — no other
change needed there. (Store-specific promo still wins over the national one because the
exact key is checked first.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Derive discountPct in classifyMechanism

In `extraction.ts`, change `classifyMechanism`'s return type and the percentage branch:

```ts
export function classifyMechanism(
  candidate: VisionCandidate,
): { mechanism: PromotionMechanism | "OTHER"; bundleQty: number | null; discountPct: number | null } {
```

```ts
  const pctMatch = /-\s*(\d{1,3})\s*%/.exec(phrase);
  if (pctMatch) {
    const pct = Number(pctMatch[1]);
    return { mechanism: "PERCENTAGE_OFF", bundleQty: null, discountPct: pct >= 1 && pct <= 100 ? pct : null };
  }
```

Every other `return` in the function gains `discountPct: null` (including the
SECOND_UNIT_DISCOUNT branch, which stays null — the solver already defaults it to 50).
Update the single caller `candidatesFromExtraction` (:149) to carry
`discountPct` into the mapped candidate, and add `discountPct: number | null` to the
`CatalogueCandidate` interface (:65-79).

**Verify**: `pnpm --filter @maqrivo/web test` → existing extraction tests still pass
(if any assert the exact return shape of classifyMechanism, update them minimally).

### Step 3: Persist discountPct on confirmation

In `actions.ts`:
- `confirmSchema` (:137-149): add `discountPct: z.number().int().min(1).max(100).nullable()`.
- The promotion `insert` values (:176-202): add `discountPct: d.discountPct ?? null,`.

In `page-card.tsx` `confirm()` (:82-101):
- Stop the regular-price fallback for percentage deals and pass `discountPct` through:

```ts
    const promoPrice = candidate.mechanism === "PERCENTAGE_OFF" ? candidate.promoPriceCents : candidate.promoPriceCents ?? candidate.regularPriceCents;
    const result = await confirmCandidateAction({
      // ... existing fields ...
      discountPct: candidate.mechanism === "PERCENTAGE_OFF" ? candidate.discountPct : null,
```

  (For a pct-only offer with no printed promo price, `promoPrice` is null and
  `regularPriceCents` still carries the base price — the existing `price-required` guard at
  actions.ts:168-170 accepts pricePerKg as well, so a pct offer with NO price at all is
  still rejected, which is correct: no evidence, no deal.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Tests

Extend `apps/web/test/extraction.test.ts` (model after its existing `classifyMechanism`
cases; read the file first and match its style):
- `-30%` phrase → `{ mechanism: "PERCENTAGE_OFF", discountPct: 30 }` propagated into the
  candidate from `candidatesFromExtraction`.
- `2ème à -50%` → SECOND_UNIT_DISCOUNT with `discountPct: null` (solver defaults to 50).
- `le lot de 2` → MULTIBUY, discountPct null.
- A candidate with regular 4.99 / promo 2.99 and no phrase → PROMO_PRICE, discountPct null.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, ≥4 new assertions.
**Verify**: `pnpm solver:test` → all pass (contract untouched).

## Test plan

Covered in Step 4. The planner change is a two-line lookup verified by typecheck + the
existing solver contract tests; a DB-integration planner test is out of scope (no harness
exists — see plans/README.md rejected section).

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @maqrivo/web test` exits 0 with new discountPct cases
- [ ] `pnpm solver:test` exits 0
- [ ] `grep -n "promoByProductStore.get" apps/web/src/server/optimization/planner.ts` shows the wildcard fallback
- [ ] `git status` shows only in-scope files; `plans/README.md` row updated

## STOP conditions

- The planner excerpt doesn't match (drift — especially if plan 010 landed first).
- `classifyMechanism` has grown other callers besides `candidatesFromExtraction` (grep
  first; if so, report before changing its return type).
- The promotion table turns out to lack a `discountPct` column in
  `packages/db/src/schema/promotions.ts` (it should have one — verify with
  `grep -n discountPct packages/db/src/schema/promotions.ts`).

## Maintenance notes

- Plan 006's auto-confirm gate reuses `discountPct` as a quality signal (a parsed pct +
  parsed date + EXACT match = promotable). Keep the field deterministic-only.
- Reviewer: the wildcard fallback ordering (exact key first) is deliberate — store-specific
  promos must shadow national ones.
