# Plan 013: Plan staleness detection + opt-in auto-refresh

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/optimization apps/web/src/server/jobs/queue.ts "apps/web/src/app/[locale]/(app)/page.tsx" "apps/web/src/app/[locale]/(app)/week/page.tsx"`
> Mismatch vs "Current state" = STOP. Plans 006/007/012 touch the dashboard and queue.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (auto-replacing a curated plan is invasive — opt-in by design here)
- **Depends on**: 012 (soft — refreshed plans should net against true pantry)
- **Category**: direction (automation)
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

A plan generated Monday optimizes against Monday's prices, but the ingestion jobs land
new prices (05:43) and promotions (06:09, plus plan 005's extraction at 06:41) every
night — by Wednesday the "optimal" basket may be optimizing against dead data, silently.
The only refresh path is a manual button. This plan adds a staleness signal (badge +
count) surfaced on Today and Week, and an opt-in weekly auto-refresh that preserves the
user's locked slots — exactly what the solver's partial re-solve hint mechanism was
designed for (docs/architecture.md:44).

## Current state

- `apps/web/src/app/[locale]/(app)/week/generate-plan-button.tsx` (whole file read):
  manual button → `runWeeklyPlanAction("BALANCED")`; errors mapped for `no-recipes` /
  `solver-unavailable`.
- `apps/web/src/server/optimization/actions.ts` — `runWeeklyPlanAction(preset)` (read
  live; ≈:7-27): builds a new plan via the planner, deactivates the previous active one.
- Dashboard picks `mealPlan` where `status = "active"` newest (`page.tsx:28-35`).
- `mealSlot.locked` exists and the solver honors locked-variable hints
  (docs/architecture.md:44 — verify the planner passes locks; grep `locked` in
  planner.ts).
- Jobs schedule (post-plans 005/006/012): expiry 05:17, openprices 05:43 (wait — 05:43 is
  BEFORE 05:17? No: 05:17 expiry, 05:43 openprices, 06:09 catalogue-sync, 06:41
  page-extraction, pantry 05:31, discovery Mon 04:23). Auto-refresh belongs LAST:
  Sunday 07:19 (`19 7 * * 0`).
- There is no per-user settings table beyond nutritionProfile/locale — grep
  `nutritionProfile` schema for a natural home for the opt-in flag; if none fits, add a
  boolean column `autoRefreshPlan` to `nutritionProfile` (migration allowed) or a
  `userPrefs` jsonb — prefer the explicit column.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/optimization/staleness.ts` (create)
- `apps/web/src/server/optimization/actions.ts` (opt-in flag read + preserve-locks path, if not already default)
- `apps/web/src/server/jobs/queue.ts` (auto-refresh job)
- `packages/db/src/schema/food.ts` or wherever nutritionProfile lives (opt-in column + migration)
- `apps/web/src/app/[locale]/(app)/profile/nutrition-form.tsx` (opt-in toggle)
- `apps/web/src/app/[locale]/(app)/page.tsx`, `week/page.tsx` (badge)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`
- `apps/web/test/staleness.test.ts` (create)

**Out of scope**:
- Notifications for staleness (digest card is plan 006's lane).
- Changing solver objectives or presets.
- Refreshing more often than weekly.

## Git workflow

- Branch: `advisor/013-plan-staleness`
- Commit: `Plan staleness badge + opt-in weekly auto-refresh preserving locked slots`

## Steps

### Step 1: Staleness computation

Create `staleness.ts`:

```ts
export interface PlanStaleness {
  stale: boolean;
  newPriceObservations: number;
  newPromotions: number;
  newestDataAt: Date | null;
}

/** Count price observations observedAt > plan.createdAt and promotions
 *  (createdAt > plan.createdAt, verification != EXPIRED) that touch the products /
 *  concepts in the plan's shopping items. Simplest sound version: count rows whose
 *  productId ∈ plan items' productIds OR whose promotionProductMatch rows point at
 *  those products (EXACT/PROBABLE). Return stale = (newPriceObservations +
 *  newPromotions) >= 5 — threshold as a named const. */
export async function computePlanStaleness(planId: string): Promise<PlanStaleness>
```

Keep it to 2-3 queries; this runs per dashboard render, so also export a cheaper
`planDataFingerprint(planId)` (max observedAt / max promotion createdAt) if the count
version proves heavy — measure in dev, pick one.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Badge on Today + Week

Dashboard: near the plan header (and week page's equivalent), when `stale` render a chip:
`<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">`
with `Week.staleBadge` (en "Prices changed — refresh suggested" / fr "Prix modifiés —
rafraîchissement conseillé") plus the counts in the title attribute. Server component —
plain render, no client state needed.

**Verify**: dev check with a backdated plan (manually set createdAt back in dev DB) shows
the badge; `pnpm lint` → exit 0.

### Step 3: Opt-in flag

- Read the nutritionProfile schema (grep `nutritionProfile` in packages/db). Add
  `autoRefreshPlan: boolean("auto_refresh_plan").notNull().default(false)` to that table.
- `pnpm db:generate && pnpm db:migrate`.
- `nutrition-form.tsx`: a labeled checkbox (existing form patterns — read the file)
  persisting via the profile actions (`profile/actions.ts` — extend its zod schema).
  Key `Profile.autoRefresh` (en "Auto-refresh my plan weekly (Sunday morning, keeps my
  locked meals)" / fr "Rafraîchir mon plan chaque semaine (dimanche matin, conserve mes
  repas verrouillés)").

**Verify**: `pnpm typecheck` → exit 0; migration file generated under packages/db.

### Step 4: The weekly job

`queue.ts`: JOBS += `"plan-refresh"`, `await boss.schedule("plan-refresh", "19 7 * * 0");`
Handler: select users with `autoRefreshPlan = true` (join nutritionProfile), for each:
`computePlanStaleness(activePlan.id)` → if `stale`, call the existing
`runWeeklyPlanAction` equivalent WITH the user's context. CAUTION:
`runWeeklyPlanAction` is a session-bound server action — read it; extract its core into
an internal `generateWeeklyPlan(userId, preset)` function both the action and the job
call (session check stays in the action wrapper only).
Locked slots: verify the planner preserves `mealSlot.locked` when regenerating (grep
`locked` in planner.ts). If it does NOT, STOP and report — preserving locks is a
precondition for auto-refresh, not an enhancement.

Log per user: `[job] plan-refresh <userId>: refreshed|skipped-fresh|skipped-error`.

**Verify**: `pnpm typecheck` → exit 0; `grep -c "plan-refresh" apps/web/src/server/jobs/queue.ts` ≥ 3.

### Step 5: Tests

`apps/web/test/staleness.test.ts` — pure parts:
- threshold logic given fabricated counts (4 → fresh, 5 → stale).
- If you factored the fingerprint comparator: newer fingerprint → stale.

Drift-guard: queue.ts contains `19 7 * * 0`.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass.

## Test plan

Step 5; manual: toggle the opt-in, backdate plan, trigger the job from admin, watch the
log line, confirm the new plan exists and locked slots kept their recipes.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -n "autoRefreshPlan" packages/db/src/schema/*.ts apps/web/src/app/[locale]/(app)/profile/nutrition-form.tsx` → hits in both
- [ ] `grep -n "19 7 \\* \\* 0" apps/web/src/server/jobs/queue.ts` → 1 hit
- [ ] Both message files contain `Week.staleBadge` and `Profile.autoRefresh`
- [ ] `git status` in-scope (migration included); `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- The planner does not preserve locked slots on regeneration (grep `locked` in
  planner.ts first — this is the plan's keystone assumption).
- `runWeeklyPlanAction` cannot be split from its session dependency without touching
  out-of-scope files (report what you found).

## Maintenance notes

- The threshold (5 changed facts) is a starting heuristic — expose it as a const with a
  comment; tune from the owner's lived experience.
- Auto-refresh runs Sunday 07:19, AFTER the week's final ingestion Saturday night and
  BEFORE the shopping week starts — keep that ordering if schedules ever move.
- Reviewer: the job must NEVER refresh a plan whose user hasn't opted in, even if stale —
  the badge is the non-consented surface.
