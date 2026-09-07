# Plan 007: Error/loading/not-found boundaries

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- apps/web/src/app`
> If the app tree changed structurally (new routes), re-check the glob in Step 1 first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: ux (resilience)
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

The app has ZERO `loading.tsx`, `error.tsx`, `not-found.tsx`, or `global-error.tsx` files
(glob-verified). Any server error — including the MISSING_MESSAGE class that has crashed
SSR before — renders Next.js's default unstyled English crash page. Navigations between
heavy pages (stores with MapLibre, the dashboard's 6+ sequential queries) show blank
frames. This is the single largest resilience gap and it directly feeds the "app feels
broken" perception.

## Current state

- `ls apps/web/src/app/**/{loading,error,not-found,global-error}.tsx` → no files (verify
  again at execution time with glob).
- Routes live under `apps/web/src/app/[locale]/(app)/`: page.tsx (dashboard), shopping/,
  stores/, week/, offers/, products/, recipes/, pantry/, meals/, profile/, settings/,
  assistant/. Detail routes call `notFound()` (e.g. `recipes/[id]/page.tsx:23`,
  catalogue detail, product detail).
- Design conventions: cards use the `card` class; buttons `btn-primary`/`btn-secondary`;
  text colors zinc scale; `PageHeader` component exists in `apps/web/src/components/`;
  `EmptyState` component exists (used in offers/page.tsx:72 with an icon + title + action).
- i18n: `apps/web/messages/{en,fr}.json`. Server components use
  `getTranslations` from `next-intl/server`. IMPORTANT: `error.tsx` and
  `global-error.tsx` are CLIENT components — use `useTranslations` from `next-intl`.
  `not-found.tsx` under `[locale]` can be a server component using `getTranslations`.
- There is a root `apps/web/src/app/layout.tsx` and an `[locale]` layout — confirm exact
  paths with glob before writing files.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |
| Dev smoke | `pnpm dev` (needs .env)           | pages render        |

## Scope

**In scope** (create only, plus message files):
- `apps/web/src/app/[locale]/(app)/error.tsx`
- `apps/web/src/app/[locale]/(app)/loading.tsx`
- `apps/web/src/app/[locale]/not-found.tsx`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/app/[locale]/(app)/stores/loading.tsx`
- `apps/web/src/app/[locale]/(app)/offers/loading.tsx`
- `apps/web/src/app/[locale]/(app)/week/loading.tsx`
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`

**Out of scope**:
- Any page-level logic change (queries stay as-is).
- Suspense-streaming refactors of the dashboard (separate future work).
- PWA/offline handling.

## Git workflow

- Branch: `advisor/007-boundaries`
- Commit: `Add error/loading/not-found boundaries across the app`

## Steps

### Step 1: Confirm current file layout

Run the glob/read for `apps/web/src/app` — confirm there is no existing loading/error
file anywhere and locate the exact `[locale]` layout path. If any boundary file now
exists, skip creating that one and note it.

**Verify**: glob output matches "none exist" (or documented exceptions).

### Step 2: Global pieces

`apps/web/src/app/global-error.tsx` (client, must render its own `<html><body>`):

```tsx
"use client";
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Minimal, dependency-free (next-intl may not initialize here): bilingual copy.
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
        <h1>Une erreur est survenue · Something went wrong</h1>
        <button onClick={reset}>Réessayer · Try again</button>
      </body>
    </html>
  );
}
```

(Inline styles deliberately — globals.css may be the thing that failed.)

`apps/web/src/app/[locale]/(app)/error.tsx` (client):

```tsx
"use client";
import { useTranslations } from "next-intl";
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Errors");
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-sm font-semibold text-zinc-900">{t("boundaryTitle")}</p>
      <p className="mt-1 text-sm text-zinc-500">{t("boundaryHint")}</p>
      {error.digest ? <p className="mt-2 text-xs text-zinc-400">{error.digest}</p> : null}
      <button type="button" className="btn-primary mt-4" onClick={reset}>{t("boundaryRetry")}</button>
    </div>
  );
}
```

`apps/web/src/app/[locale]/(app)/loading.tsx` (server-safe skeleton):

```tsx
export default function AppLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton-row h-8 w-48" />
      <div className="card p-4"><div className="skeleton-row h-4 w-3/4" /><div className="skeleton-row mt-2 h-3 w-1/2" /></div>
      <div className="card p-4"><div className="skeleton-row h-4 w-2/3" /><div className="skeleton-row mt-2 h-3 w-1/3" /></div>
    </div>
  );
}
```

(`skeleton-row` class already exists — used in page-card.tsx:157-167.)

`apps/web/src/app/[locale]/not-found.tsx` (server component, `getTranslations("Errors")`):
card with `boundaryNotFound` title + a `/` link using the i18n `Link`.

Message keys (BOTH locales) under `Errors`: `boundaryTitle` (en "Something went wrong" /
fr "Une erreur est survenue"), `boundaryHint` (en "The error was logged. You can retry." /
fr "L'erreur a été consignée. Vous pouvez réessayer."), `boundaryRetry` (en "Try again" /
fr "Réessayer"), `boundaryNotFound` (en "Page not found" / fr "Page introuvable").

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Route-level loadings

Create the three `loading.tsx` files for stores/, offers/, week/ using the same skeleton
pattern, tuned: stores → one wide map placeholder (`card h-64` block with `skeleton-row`
inside), offers → three list-row skeletons, week → 7-column grid of small card skeletons
(matching week-grid.tsx proportions — read it first). No new keys needed.

**Verify**: `pnpm lint` → exit 0.

### Step 4: Dev smoke

`pnpm dev` (repo needs `.env` with DATABASE_URL etc. — check `apps/web/.env` presence;
if absent, STOP-report instead of inventing env). Visit `/fr`, `/fr/stores`, `/fr/offers`,
`/fr/week`, and a bogus URL like `/fr/recipes/00000000-0000-0000-0000-000000000000`:
each renders boundary/skeleton/404 in app chrome, never the default Next crash page.

**Verify**: manual — 4 URLs OK, 1 custom 404 OK.

## Test plan

No unit tests (framework plumbing). The dev smoke in Step 4 is the test. Optional: extend
`apps/web/test/messages-parity.test.ts` (from plan 004) already covers the new keys'
presence in both locales.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint` exit 0
- [ ] Glob `apps/web/src/app/**/{loading,error,not-found,global-error}.tsx` → exactly the
      7 files listed in Scope (or documented exceptions)
- [ ] Both message files contain the four `Errors.boundary*` keys
- [ ] Dev smoke passes (or is explicitly skipped with the .env STOP note)
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Any boundary file already exists at execution time (report instead of overwriting).
- `apps/web/.env` absent so dev smoke is impossible — complete everything else, mark the
  smoke step SKIPPED-env in the README row.

## Maintenance notes

- Keep global-error.tsx dependency-free forever — it renders when the world is on fire.
- When plan 008's onboarding card lands on the dashboard, its content belongs ABOVE the
  loading skeleton's first card, not inside it.
