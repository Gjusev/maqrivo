# Plan 010: Security hardening — IDOR scoping, unauthenticated actions, owner checks

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/plans/actions.ts apps/web/src/server/catalogues/actions.ts apps/web/src/server/receipts/actions.ts "apps/web/src/app/api/catalogues/pages/[pageId]/image/route.ts" apps/web/src/server/ai/actions.ts apps/web/src/server/storage.ts`
> Mismatch vs "Current state" = STOP. Plans 002/003/005 touch catalogues/actions.ts —
> re-read the live file first.

## Status

- **Priority**: P2
- **Effort**: M (many small fixes)
- **Risk**: LOW (each fix narrows access; the app is invite-gated single-user today, so
  regressions surface as visible errors, not lockouts)
- **Depends on**: none (serialize with 002/003 when editing actions.ts)
- **Category**: security
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Verified authn/authz gaps: three plan-mutation actions update rows by raw id with no
ownership join (any signed-in user can rewrite another's meal slots / shopping items);
`getPageCandidates` and `recomputeTotal` are exported `"use server"` functions with NO
session check at all (public POST endpoints); `getReceiptLines` reads any user's receipt
lines; the leaflet page-image route serves photos to any signed-in user while the sibling
evidence route correctly 403s non-owners; the assistant forwards client-supplied chat
history roles verbatim to the LLM. Individually minor in a single-user deploy; together
they are the difference between "hardened" and "one invite away from a problem".

## Current state (all verified by direct reads)

- `apps/web/src/server/plans/actions.ts` (whole file read, 47 lines): three actions —
  `toggleSlotLockAction` (:9), `setSlotRecipeAction` (:23), `setShoppingItemStatusAction`
  (:34) — each checks session then updates `mealSlot`/`shoppingItem` by id alone.
  Ownership lives one hop away: `mealSlot.mealPlanId → mealPlan.userId`,
  `shoppingItem.shoppingPlanId → shoppingPlan.userId` (`packages/db/src/schema/plans.ts`).
- `apps/web/src/server/catalogues/actions.ts`:
  - `getPageCandidates(pageId)` (:121) — no `getSessionContext()` at all; post-plan-003 it
    filters jsonb by pageId but still no session check.
  - `recomputeTotal(planId)` (:287) — exported, no session check, writes DB.
  - `extractPageAction` checks session but any user can extract any page (AI-spend).
- `apps/web/src/server/receipts/actions.ts:280-306` — `getReceiptLines(receiptId)`:
  no session check, no `receipt.userId` comparison. Contrast the CORRECT pattern two
  functions up: `confirmReceiptLineAction` loads the parent receipt and rejects on
  `row.userId !== session.userId` (≈:158-162 — read live).
- `apps/web/src/app/api/evidence/[id]/route.ts:15-19` — the exemplar owner check:
  ```ts
  if (evidence.ownerUserId && evidence.ownerUserId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  ```
  `apps/web/src/app/api/catalogues/pages/[pageId]/image/route.ts:10-19` has auth but no
  owner check. Catalogue pages created by sync have `sourceEvidence` rows without
  ownerUserId (global), user-uploaded ones are personal — resolve the page's evidence row
  via `cataloguePage.imageKey → sourceEvidence.storageKey` and apply the same rule.
- `apps/web/src/server/ai/actions.ts:6-9` — `askAssistantAction(history)` passes the raw
  client array through; `assistant.ts:158-159` maps `m.role` verbatim into OpenAI
  messages.
- `apps/web/src/server/storage.ts:31-48` — `saveImage` interpolates `folder` into the key
  with no traversal guard (readImage at :51-58 HAS one: resolve-and-prefix).

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/plans/actions.ts`
- `apps/web/src/server/catalogues/actions.ts`
- `apps/web/src/server/receipts/actions.ts`
- `apps/web/src/app/api/catalogues/pages/[pageId]/image/route.ts`
- `apps/web/src/server/ai/actions.ts`
- `apps/web/src/server/storage.ts`
- `apps/web/test/action-scoping.test.ts` (create — drift-guard style)

**Out of scope**:
- An isAdmin role model + compose port binding (separate decision for the owner: gating
  global-catalog mutations like `setHalalStateAction` changes product workflow — flagged
  in plans/README.md rejected section as needing product input).
- SSRF allowlisting in `integrations/http.ts` (real but indirect — posture work, deferred).
- Any UI change.

## Git workflow

- Branch: `advisor/010-security-hardening`
- Commit: `Security hardening: ownership scoping on plan/catalogue/receipt actions, owner-checked page images, zod'd assistant history, saveImage guard`

## Steps

### Step 1: Scope the plan actions

In `plans/actions.ts`, rewrite each action to join through to ownership. Pattern (drizzle):

```ts
export async function toggleSlotLockAction(slotId: string): Promise<{ ok: boolean }> {
  const session = await getSessionContext();
  if (!session) return { ok: false };
  const slot = (
    await db
      .select({ slot: mealSlot })
      .from(mealSlot)
      .innerJoin(mealPlan, eq(mealSlot.mealPlanId, mealPlan.id))
      .where(and(eq(mealSlot.id, slotId), eq(mealPlan.userId, session.userId)))
      .limit(1)
  )[0];
  if (!slot) return { ok: false };
  // ... unchanged update ...
```

Same shape for `setSlotRecipeAction` (join mealPlan) and `setShoppingItemStatusAction`
(join shoppingPlan). ADD zod validation to the status union:

```ts
const statusSchema = z.enum(["pending", "purchased", "unavailable", "skipped"]);
```

(import zod; parse before the update — reject on failure with `{ ok: false }`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: catalogues/actions.ts — auth + unexport

- `getPageCandidates`: add the session check (`if (!session) return [];`). Leave its
  query as plan 003 shaped it.
- `recomputeTotal(planId)`: remove the `export` keyword (grep first: if anything outside
  this file imports it, instead scope it by joining `shoppingPlan.userId` — choose based
  on the grep result and note it in the commit).
- `extractPageAction`: leave session-only (page photos synced globally are shared
  evidence; per-user AI spend abuse is acceptable for the owner's single-user deploy —
  documented decision, do not add tighter scoping here).

**Verify**: `grep -n "export async function recomputeTotal" apps/web/src/server/catalogues/actions.ts` → no match (or scoped variant); `pnpm typecheck` → exit 0.

### Step 3: getReceiptLines ownership

In `receipts/actions.ts`, mirror the confirm-line pattern: load the parent receipt first,
reject when `receipt.userId !== session.userId` (return `[]` when unauthenticated,
`throw`/`return []` on mismatch — match how the file's other viewers behave; read
`receipts/[id]/page.tsx` to confirm it also guards, then keep the action-level guard
anyway: the UI layer is not a security boundary).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Page-image route owner check

In `api/catalogues/pages/[pageId]/image/route.ts`, after loading the page row, resolve
its evidence (`select from sourceEvidence where storageKey = page.imageKey`) and apply
the evidence-route rule: 403 when `evidence.ownerUserId && evidence.ownerUserId !==
session.user.id`. Sync-created pages (no ownerUserId) stay visible to all signed-in
users — correct: national leaflets are shared evidence.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Assistant history zod

In `ai/actions.ts`:

```ts
const historySchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(4000),
  }),
).max(12);
```

Parse; on failure reject with `{ ok: false, error: "invalid" }` (match the file's result
shape). On success pass the PARSED data onward (assistant.ts's slice(-12) becomes a
no-op but harmless).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 6: saveImage traversal guard

In `storage.ts`, copy readImage's resolve-and-prefix approach: after building the final
path, verify the resolved path starts with the resolved uploads root; on mismatch throw
(the folder arg is currently always a DB uuid — this is defense-in-depth).

**Verify**: `pnpm typecheck` → exit 0.

### Step 7: Drift-guard tests

`apps/web/test/action-scoping.test.ts` (source-level assertions, plan 001's style):
- `plans/actions.ts` contains `eq(mealPlan.userId` and `eq(shoppingPlan.userId`.
- `catalogues/actions.ts` `getPageCandidates` section contains `getSessionContext`.
- `receipts/actions.ts` `getReceiptLines` contains a userId comparison.
- `ai/actions.ts` contains `z.enum(["user", "assistant"])`.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, 4 new assertions.

## Test plan

Step 7 (source-drift guards — the repo has no DB-backed action test harness; these pin
the security-relevant lines against regression). Full behavioral tests need a two-user
harness: deferred.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -c "getSessionContext" apps/web/src/server/catalogues/actions.ts` increased by 1
- [ ] `pnpm --filter @maqrivo/web test` includes action-scoping.test.ts, 4 passing asserts
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- `recomputeTotal` has external importers you cannot scope without touching out-of-scope
  files (report the importer list).
- The evidence lookup for page images reveals multi-evidence rows per storageKey
  (unlikely; report if so).

## Maintenance notes

- The isAdmin/role-model decision and the compose `127.0.0.1:3000:3000` port binding are
  deliberately NOT here — they change deployment/workflow and need owner sign-off. The
  port binding specifically: check `compose.prod.yaml` — if Dokploy's proxy requires the
  exposed port, binding to localhost breaks the deploy; ask, don't guess.
- Every new server action from now on must start with the session+ownership pattern —
  plan 006's auto-confirm code is the first customer.
