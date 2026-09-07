# Plan 012: Close the pantry loop — restock on purchase, deduct on consumption

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/plans/actions.ts apps/web/src/server/recipes/actions.ts apps/web/src/server/optimization/planner.ts apps/web/src/server/receipts/actions.ts`
> Mismatch vs "Current state" = STOP. Plan 010 rewrites plans/actions.ts — re-read first.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (pantry truth is trust-critical; wrong deductions poison the next plan)
- **Depends on**: 010 (the action you extend gets ownership scoping there)
- **Category**: direction (automation)
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Today the pantry decays immediately out of truth: mark shopping items "purchased" and
NOTHING lands in the pantry (the user must hand-add every item); cook a planned meal and
NOTHING is deducted (status `consumed_by_plan` exists in the enum but nothing ever sets
it — grep-verified). The next weekly plan then double-buys. The owner's "almost everything
automatic" explicitly includes this loop. This plan ships the unambiguous half
(purchased → restock) and the plannable half (plan consumption → deduction), each behind
clear semantics, with receipts' per-line pantry add fixed to use real quantities.

## Current state (verified)

- `apps/web/src/server/plans/actions.ts:34-47` — `setShoppingItemStatusAction(itemId,
  status)`: flips status, zero side effects. (Plan 010 adds ownership + zod here.)
- `packages/db/src/schema/plans.ts` — `shoppingItem` carries `productId`, `quantity`
  (numeric), `storeId`, `status` enum pending/purchased/unavailable/skipped (verify
  column names by reading the live schema; ≈:98).
- `apps/web/src/server/recipes/actions.ts:194-246` — pantry actions (verified):
  `addPantryItemAction(input)` inserts `{ userId, conceptId?, productId?, quantity,
  expiresOn? }` (read the exact insert values at :201-209); `adjustPantryQuantityAction`
  (:214-232) is the canonical increment/decrement with `used_up` at zero;
  `setPantryStatusAction` (:234-246) accepts `"consumed_by_plan"` among statuses.
- `apps/web/src/server/optimization/planner.ts:253-275` — planner READS pantry to net
  requirements (read live for the exact shape: which quantities/units it nets).
- `apps/web/src/server/receipts/actions.ts:230-256` —
  `addReceiptLineToPantryAction`: per-line manual, quantity hardcoded to 1 (read live).
- `pantryItem` schema (`packages/db/src/schema/pantry.ts`): userId, conceptId?, productId?,
  quantity numeric, unit, status, expiresOn?, dates.
- The week grid (`week/week-grid.tsx`) and mealSlot power consumption timing: a slot has
  `slotDate` (date) + `recipeId` + servings scaling.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/plans/actions.ts` (restock hook)
- `apps/web/src/server/pantry/loop.ts` (create — restock + deduct helpers)
- `apps/web/src/server/jobs/queue.ts` (daily consumption sweep)
- `apps/web/src/server/receipts/actions.ts` (line quantity fix)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json` (any user-visible copy — the
  shopping row may show a "→ pantry" confirmation chip)
- `apps/web/test/pantry-loop.test.ts` (create)

**Out of scope**:
- Any change to the planner's netting math (it already consumes pantry correctly on
  READ; this plan fixes the WRITE side).
- Receipt auto-ingest into pantry (stays per-line manual, just with real quantities).
- Consumption settings UI (deduction is unconditional for past slots of the ACTIVE plan;
  an opt-out can follow if the owner wants it).

## Git workflow

- Branch: `advisor/012-pantry-loop`
- Commit: `Pantry loop: restock on purchase, deduct consumed plan slots, real receipt quantities`

## Steps

### Step 1: Restock helper + purchase hook

Create `apps/web/src/server/pantry/loop.ts`:

```ts
/** Idempotent-ish upsert: add quantity to an existing active pantry row for the same
 *  product (or concept), else insert a new one. Mirrors addPantryItemAction's insert
 *  shape (recipes/actions.ts:201-209) — read it and reuse the same defaults. */
export async function restockFromPurchase(input: {
  userId: string;
  productId: string | null;
  conceptId: string | null;
  quantity: number;   // in the shopping item's unit
  unit: string;
}): Promise<void>
```

Match semantics: find pantry rows `userId AND productId = input.productId` (prefer
product match; fall back to conceptId when productId null) AND `status = "active"`;
increment quantity (reuse the rounding from `adjustPantryQuantityAction`:228); else
insert. Do nothing when both ids are null.

In `plans/actions.ts` `setShoppingItemStatusAction`: after a successful
`"purchased"` transition AND the item not already purchased before (read current status
first — plan 010's rewrite already loads the row for ownership), call
`restockFromPurchase` with the item's product/concept/quantity/unit (read the
`shoppingItem` columns live; if the item has no product/concept link, skip silently).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Consumption sweep

In `pantry/loop.ts` add:

```ts
/** Deduct pantry for meal slots of plans whose slotDate has passed. For each past,
 *  unprocessed slot with a recipe, subtract the slot's scaled per-concept quantities
 *  from pantry (product-linked rows preferred, concept rows otherwise), flooring at 0
 *  with status used_up. Mark processed via pantryItem status flow? NO — track via a
 *  new lightweight guard: only slots of plans with status 'active' AND slotDate <
 *  today AND not yet swept. Swept-ness: mealSlot has no processed flag; instead of a
 *  schema change, dedupe by only ever deducting for slotDates within the last 7 days
 *  AND recording the sweep window in ingestionRun (kind 'pantry_consumption', stats
 *  {from,to}) — skip ranges already recorded. */
export async function runPantryConsumptionSweep(): Promise<{ slots: number; deducted: number }>
```

Read the planner's requirement netting (planner.ts:253-275) to compute per-concept
quantities for a slot at its servings scale — factor a shared pure helper if the math is
duplicated, else compute inline from `recipeIngredient` rows (quantity × slotServings /
recipeServings). Wrap in an `ingestionRun` row (pattern: catalogue-sync.ts:51-62) with
kind `"pantry_consumption"` — check `ingestionKindEnum` in `packages/db/src/schema/enums.ts`;
if the enum lacks the value, add it there + `pnpm db:generate && pnpm db:migrate`
(migration allowed for this plan).

Wire into `queue.ts`: JOBS += `"pantry-consumption"`, schedule `"31 5 * * *"` (between
expiry 05:17 and openprices 05:43), handler logs counts, admin trigger fallback added.

**Verify**: `pnpm typecheck` → exit 0; `grep -c "pantry-consumption" apps/web/src/server/jobs/queue.ts` ≥ 3.

### Step 3: Receipt line quantity fix

In `receipts/actions.ts` `addReceiptLineToPantryAction`: replace the hardcoded quantity 1
with the line's own quantity (`line.quantityKg` when present, else 1 — read the receiptLine
schema columns live; preserve the unit field semantics the pantry expects).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Tests

`apps/web/test/pantry-loop.test.ts` — the pure quantity math, exported from loop.ts as
`slotConceptQuantities(ingredients, recipeServings, slotServings)`:
- exact scale-up (servings ×2 → quantities ×2)
- fractional rounding to 3 decimals (match :228's `Math.round(next * 1000) / 1000`)
- zero-servings guard

Plus a drift-guard: `plans/actions.ts` contains `restockFromPurchase`.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, ≥4 cases.

## Test plan

Step 4. Manual dev verification of the full loop (needs seeded plan): mark an item
purchased → pantry row appears/increments; backdate a slot → next sweep (admin trigger)
deducts; regenerate plan → requirements net correctly.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -n "restockFromPurchase" apps/web/src/server/plans/actions.ts` → 1 call
- [ ] `grep -n "31 5 \\* \\* \\*" apps/web/src/server/jobs/queue.ts` → 1 hit
- [ ] `git status` in-scope only (migration files allowed if enum extended); `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts, especially plans/actions.ts after plan 010.
- `shoppingItem` lacks product/concept/quantity columns usable for restock (report the
  actual columns).
- The 7-day window dedupe proves unsound for your reading of the data (report the
  scenario; a schema flag on mealSlot is the fallback — needs a migration decision).

## Maintenance notes

- Deduction is intentionally READ-only on recipes: if an ingredient list changes
  post-hoc, past deductions stand (they reflect what was believed cooked).
- Plan 013's auto-refresh consumes pantry truth — this plan landing first is what makes
  refreshed plans correct.
- Reviewer: scrutinize the restock idempotency (re-marking an item purchased after
  un-purchasing must not double-restock — the before/after status check is the guard).
