# Plan 006: Auto-confirm gate, daily digest, weekly discovery, Carrefour honesty

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/server/jobs/queue.ts apps/web/src/server/stores/discovery.ts apps/web/src/server/ingestion/promotions.ts "apps/web/src/app/[locale]/(app)/page.tsx" "apps/web/src/app/[locale]/(app)/offers/catalogues/new-catalogue-button.tsx"`
> Mismatch vs "Current state" = STOP. Plans 002/003/005 touch adjacent server code —
> re-read live files first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (auto-creating promotions from vision output — gated hard, see below)
- **Depends on**: 005 (extraction job produces the candidates), 002 (discountPct signal), 003 (dedup pre-check)
- **Category**: direction (automation)
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

The owner wants "almost everything automatic". After plan 005, extraction runs nightly —
but every candidate still waits for a human tap, and the automation is INVISIBLE: the
dashboard shows nothing about the 100+ promotions that arrived overnight, stores are only
discovered when someone presses Discover (docs already promise a weekly refresh that was
never wired), and enabling a Carrefour store silently yields zero catalogues forever
because no flipbook adapter is registered for Carrefour. This plan closes those four gaps
while keeping the repo's "no evidence, no deal" principle: auto-confirm fires ONLY on
strictly deterministic signals.

## Current state

- **Precedent for auto-truth** (the pattern this plan generalizes):
  `apps/web/src/server/ingestion/catalogue-sync.ts` `ingestStructuredItems` (≈:200-272)
  already turns retailer STRUCTURED payloads into promotions with no human —
  `verification: "EXTRACTED"`, `confidence: "HIGH"`, deterministic
  `tryMatchPromotionProduct` matching. Vision output currently requires confirmation
  because it is weaker evidence; the gate below only promotes vision candidates whose
  signals are as deterministic as the structured path.
- `apps/web/src/server/ingestion/promotions.ts:91-138` — `tryMatchPromotionProduct`
  (deterministic: EAN → EXACT; brand+name heuristics otherwise; UNRESOLVED is valid).
- `apps/web/src/server/jobs/queue.ts:13,40-42` — three jobs scheduled daily; no
  store-discovery job. `runStoreDiscovery(userId)` exists in
  `apps/web/src/server/stores/discovery.ts:27` (writes ingestionRun kind `store_refresh`,
  isolates per-source failures into warnings) but is only called from the manual
  `discoverStoresAction` (stores/actions.ts:34).
  docs/architecture.md:49 and docs/retailer_adapters.md:37 PROMISE a weekly store refresh.
- `apps/web/src/server/integrations/retailers/adapters.ts:6-10` — registrations: auchan,
  g20, intermarche, lidl, monoprix. `carrefour.ts` is discovery-only (eligibility API);
  no flipbook registration exists for Carrefour, E.Leclerc, Franprix.
- `apps/web/src/app/[locale]/(app)/offers/catalogues/new-catalogue-button.tsx:53-58` —
  hardcoded slug list rendered as raw lowercase strings:
  `["carrefour", "intermarche", "lidl", "leclerc", "monoprix", "franprix", "g20", "independent"]`.
- Dashboard `apps/web/src/app/[locale]/(app)/page.tsx:93-103` — only "what changed"
  surface is pantry expiry within 3 days; promotions/prices invisible.
- `packages/db/src/seed/retailers.ts` — canonical slug/name pairs (display names exist
  here: "Carrefour", "Intermarché", …).

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/server/catalogues/auto-confirm.ts` (create)
- `apps/web/src/server/catalogues/extraction-runner.ts` (call the gate at sweep end)
- `apps/web/src/server/jobs/queue.ts` (store-discovery job)
- `apps/web/src/server/stores/discovery.ts` (only if a per-area entry point is needed)
- `apps/web/src/app/[locale]/(app)/page.tsx` (digest card)
- `apps/web/src/app/[locale]/(app)/offers/catalogues/new-catalogue-button.tsx`
- `apps/web/src/lib/retailers.ts` (create — shared display-name list)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`
- `apps/web/test/auto-confirm-gate.test.ts` (create)

**Out of scope**:
- Notification channels (email/push) — the digest card is the payload source later.
- Writing a Carrefour flipbook adapter (ADR-0005 experimental posture — this plan only
  makes the gap HONEST in the UI).
- Auto-refresh of meal plans (plan 013).

## Git workflow

- Branch: `advisor/006-auto-confirm-visibility`
- Commit: `Auto-confirm high-signal candidates, daily digest, weekly discovery, honest retailer list`

## Steps

### Step 1: The deterministic auto-confirm gate

Create `apps/web/src/server/catalogues/auto-confirm.ts`:

```ts
export interface AutoConfirmDecision {
  promotable: boolean;
  reason: "no-price" | "no-date" | "no-match" | "ok";
}

/**
 * Strict, deterministic-only gate (never fuzzy). A vision candidate is
 * auto-promoted ONLY when all three hold, mirroring the evidence quality of
 * the structured-ingest path (catalogue-sync.ts ingestStructuredItems):
 *  1. price parsed non-null (promoPriceCents or pricePerKgCents), and
 *     discountPct when mechanism is PERCENTAGE_OFF (plan 002);
 *  2. validUntil parsed from the printed leaflet date (not the heuristic);
 *  3. product match state EXACT (EAN/barcode-deterministic).
 * Everything else stays a review candidate. No exceptions for "looks good".
 */
export function autoConfirmDecision(candidate: CatalogueCandidate, matchState: "EXACT" | "PROBABLE" | "AMBIGUOUS" | "UNRESOLVED" | null): AutoConfirmDecision
```

Implement the three checks in order, returning the first failing reason. Then add
`promoteCandidate(candidate, pageContext)` that reuses `confirmCandidateAction`'s insert
shape (read the live actions.ts after plan 003 lands — it must include the dedup pre-check
and set `confidence: "MEDIUM"`, `verification: "EXTRACTED"`, and a distinct
`sourceEvidence` link) — call it from `extraction-runner.ts` after each successful
extraction for candidates passing the gate, respecting plan 003's dedup. Product-match
state comes from running `tryMatchPromotionProduct` on a TEMP basis: simplest correct
route is to insert nothing, run the matcher's brand+name logic via its exported helpers if
available — read `promotions.ts:91-138` first; if the matcher only works post-insert,
promote via: insert promotion (confidence MEDIUM) → run matcher → if match ≠ EXACT, flip
`verification` to "PENDING_REVIEW" (enum permitting — check `enums.ts`; if not present,
delete the row and log). Choose the route that keeps UNRESOLVED out of auto-truth and
document it in the code comment.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Gate tests

`apps/web/test/auto-confirm-gate.test.ts` — table-driven over `autoConfirmDecision`:
- price + printed date + EXACT → promotable "ok"
- price + heuristic date (candidate.validUntil null, caller passes null) → "no-date"
- PERCENTAGE_OFF with discountPct null → "no-price"
- PROBABLE match → "no-match"
- UNRESOLVED → "no-match"

**Verify**: `pnpm --filter @maqrivo/web test` → all pass, 5 new cases.

### Step 3: Weekly store-discovery job

- `stores/discovery.ts`: add `export async function runStoreDiscoverySweep(): Promise<{ users: number; discovered: number }>` —
  select DISTINCT users having a home location (`profile`/`user` table — locate the home
  lat/lng columns with grep; they power the stores page), cap at 20 users/run, call
  `runStoreDiscovery(userId)` per user, catch per-user errors into warnings.
- `queue.ts`: add `"store-discovery"` to JOBS, handler logging the counts, and
  `await boss.schedule("store-discovery", "23 4 * * 1");` (Mondays 04:23, off-minute).
- Admin trigger union += `"store-discovery"` with inline fallback.

**Verify**: `pnpm typecheck` → exit 0; `grep -c "store-discovery" apps/web/src/server/jobs/queue.ts` ≥ 3.

### Step 4: Dashboard digest card

In `page.tsx`, below the pantry-expiring block (≈:93-103), add a "New at your stores"
section: query promotions joined to retailer where
`createdAt > now - 7 days` AND (promotion.storeId IN user's enabled stores via
`userStorePrefs` OR promotion.storeId IS NULL for a retailer with any enabled store — the
same two-tier shape as catalogue-sync.ts:284-300), `limit 5`, plus a count query for the
total. Render name/retailer/price with a "See all →" link to /offers. Keys under
`Today.newOffers` (title / seeAll) in BOTH locales. Hide the card when count is 0.

**Verify**: `pnpm typecheck` → exit 0; manual dev render of `/` shows the card when
seeded promotions exist.

### Step 5: Honest retailer list in the new-catalogue form

- Create `apps/web/src/lib/retailers.ts` exporting
  `CATALOGUE_RETAILERS: { slug: string; label: string; source: "auto" | "photo" }[]`
  derived from the seed list + adapter registrations: auto = auchan, g20, intermarche,
  lidl, monoprix (flipbook-registered); photo = carrefour, leclerc, franprix, independent.
  Labels use the display names from `packages/db/src/seed/retailers.ts` (import or
  duplicate the four needed — duplication with a comment is acceptable to avoid a
  db-package import in client code).
- `new-catalogue-button.tsx:53-58`: render from `CATALOGUE_RETAILERS`, `defaultValue`
  stays `"carrefour"`, and append a per-option hint for photo-only retailers — keys
  `Catalogues.sourceAuto` (en "automatic" / fr "automatique") and
  `Catalogues.sourcePhoto` (en "photo only" / fr "photo uniquement"), rendered as
  `· automatique` / `· photo uniquement` after the label.
- Same list replaces the duplicated slug array in
  `offers/new-promotion-button.tsx:85-89` (read it first; keep its default).

**Verify**: `pnpm lint` → exit 0; `grep -rn "franprix" apps/web/src/app --include=*.tsx | wc -l` → 0 (no raw slug arrays left in the two forms).

## Test plan

Step 2's gate tests are the load-bearing ones. The digest query and sweep job need live
DB — verify manually in dev (trigger via admin page; watch `[job]` log lines).

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -n "autoConfirmDecision" apps/web/test/auto-confirm-gate.test.ts` → present with 5 cases
- [ ] `grep -n "23 4 \\* \\* 1" apps/web/src/server/jobs/queue.ts` → 1 hit
- [ ] Both message files contain `Today.newOffers` and `Catalogues.sourceAuto`/`sourcePhoto`
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- The promotion `verification` enum lacks a review-pending value AND the matcher cannot
  run pre-insert (report the exact enum values found in `packages/db/src/schema/enums.ts`).
- No user home-location columns exist where grep expects them (report the actual profile
  shape).

## Maintenance notes

- The gate is intentionally stricter than the structured path (EXACT-only matches,
  printed dates only). Loosening it is a policy decision, not a refactor — reviewers
  should treat any widening as needing explicit owner sign-off.
- Digest card is the future notification payload: keep the query in a server module
  (`server/ingestion/digest.ts` is acceptable if page.tsx would otherwise bloat) so a
  notifier job can reuse it.
- Weekly discovery caps at 20 users — fine for a personal deploy; revisit for growth.
