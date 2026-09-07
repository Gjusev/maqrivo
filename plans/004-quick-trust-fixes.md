# Plan 004: Quick trust fixes — titles, favorite bug, receipt store picker, pantry row

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- "apps/web/src/app/[locale]/(app)/settings/page.tsx" "apps/web/src/app/[locale]/(app)/recipes/[id]" "apps/web/src/app/[locale]/(app)/shopping/receipts/receipt-uploader.tsx" "apps/web/src/app/[locale]/(app)/pantry/pantry-row.tsx" apps/web/src/lib/nav.ts`
> Mismatch vs "Current state" = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + ux
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

A cluster of small, verified defects that make the app feel broken and can silently destroy
data: the Settings page is literally titled "Language"; the recipe-edit page is titled
"Create"; opening a favorited recipe shows an empty star and tapping it UNFAVORITES;
receipts are always attributed to the user's first enabled store (corrupting price
history); every pantry +/- tap does a full page reload and trash deletes with no confirm;
the assistant — the app's AI surface — is unreachable from navigation, while /meals is a
permanent empty stub.

## Current state (all verified by direct reads)

- `apps/web/src/app/[locale]/(app)/settings/page.tsx:16` —
  `<PageHeader title={tc("language")} />` where `tc = getTranslations("Common")`. The page
  also renders export + danger zone; it needs its own title key.
- `apps/web/src/app/[locale]/(app)/recipes/[id]/edit/page.tsx:27` — header uses
  `t("create")` (Recipes namespace) on the edit route.
- `apps/web/src/app/[locale]/(app)/recipes/[id]/page.tsx:56` —
  `<RecipeActions recipeId={rows.id} favorite={false} own={...} />` — literal `false`.
  The list page does the correct join (`recipes/page.tsx` joins `userRecipePrefs`); the
  detail query does not.
- `apps/web/src/app/[locale]/(app)/shopping/receipts/receipt-uploader.tsx`:
  - :30 `if (!file || pending || stores.length === 0) return;`
  - :35 `form.append("storeId", stores[0]!.id);` — first store always wins.
  - :49 `if (stores.length === 0) return null;` — uploader vanishes with no explanation.
- `apps/web/src/app/[locale]/(app)/pantry/pantry-row.tsx:27` —
  `const router = { refresh: () => window.location.reload() };` and every action ends in a
  full reload; trash icon deletes with no confirm (:63-70).
  Contrast: `shopping/shopping-item-row.tsx` uses `useOptimistic` + `useTransition` — the
  pattern to copy.
- `apps/web/src/lib/nav.ts:21-33` — `NAV_ITEMS` has no `assistant` entry; `meals` is a
  primary-less item pointing at a stub page (`meals/page.tsx` is PageHeader + EmptyState
  only).
- Detail pages have no back navigation (`Common.back` key exists in both locales, used
  nowhere except receipts detail).
- i18n files: `apps/web/messages/{en,fr}.json`.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- The five UI files above + `apps/web/src/app/[locale]/(app)/recipes/[id]/edit/page.tsx`
- `apps/web/src/app/[locale]/(app)/meals/page.tsx` (remove nav entry OR keep page — see Step 5)
- `apps/web/src/lib/nav.ts`
- Detail pages for back links: `offers/catalogues/[id]/page.tsx`, `recipes/[id]/page.tsx`,
  `products/[id]/page.tsx`, `recipes/[id]/edit/page.tsx`
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`

**Out of scope**:
- Any server logic change EXCEPT the recipe-detail query join (read-only query change).
- The lightbox/leaflet reading experience (plan 008).
- Onboarding checklist (plan 008).

## Git workflow

- Branch: `advisor/004-quick-trust`
- Commit: `Quick trust fixes: page titles, recipe favorite state, receipt store picker, pantry row UX`

## Steps

### Step 1: Correct page titles

- `settings/page.tsx:16` → `<PageHeader title={t("title")} />` with a new
  `SettingsPage.title` key: en `"Settings"`, fr `"Réglages"`. (A `SettingsPage` namespace
  already exists — `t` is already bound to it at :8.)
- `recipes/[id]/edit/page.tsx:27` → new `Recipes.editTitle`: en `"Edit recipe"`,
  fr `"Modifier la recette"`.
- Dashboard CTA label `apps/web/src/app/[locale]/(app)/page.tsx:187` links to /shopping
  with `t("createPlan")` — replace with a dedicated key `Today.shoppingCard`
  (en `"My shopping list"`, fr `"Ma liste de courses"`). Read the surrounding JSX first
  and keep the existing Link/className structure.
- `week/page.tsx:115` and `shopping/page.tsx:47` hardcode English "→ shopping"/"→ week"
  inside links — replace with `Week.goToShopping` / `Shopping.goToWeek` keys
  (en: "Go to shopping →" / "Go to week →"; fr: "Voir les courses →" / "Voir la semaine →").

**Verify**: `grep -n '"title"' apps/web/messages/en.json | grep -c Settings` ≥1 (key
exists); `pnpm typecheck` → exit 0.

### Step 2: Recipe favorite state on detail

In `recipes/[id]/page.tsx`, extend the existing query with a `userRecipePrefs` left-join on
`(recipeId = recipe.id AND userId = session.userId)` — copy the join shape from
`recipes/page.tsx:21-26` (read it first) — and pass
`favorite={prefsRow?.favorite ?? false}` to `RecipeActions`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Receipt store picker + honest empty state

In `receipt-uploader.tsx`:
- Add `const [storeId, setStoreId] = useState<string | null>(null);`, defaulting to
  `stores[0]?.id` once loaded.
- Render a `<select name="store">` with the fetched stores (label from existing
  `Receipts.store` key if present — check; else add `Receipts.store`: en "Store", fr "Magasin").
- `form.append("storeId", storeId ?? stores[0]!.id);`
- Replace `if (stores.length === 0) return null;` with an EmptyState-style card linking
  to `/stores` — new keys `Receipts.needStores` (en: "Add and enable a store first to
  upload receipts."; fr: "Ajoutez et activez d'abord un magasin pour déposer des tickets.")
  using the existing `Link` from `@/i18n/navigation` and the `btn-secondary` class.

**Verify**: `pnpm lint` → exit 0.

### Step 4: Pantry row without reloads + delete confirm

In `pantry-row.tsx`:
- Replace the fake router with `useRouter` from `@/i18n/navigation` and wrap each action
  call in `startTransition(() => router.refresh())` after awaiting it — copy the structure
  of `shopping-item-row.tsx:30-36` (read it; it uses `useOptimistic` — replicate for the
  quantity display where straightforward, otherwise plain pending state is acceptable).
- Delete: two-step confirm — first tap sets `confirmingDelete` state and swaps the icon to
  a text button (`Common.confirm` key — verify it exists in both locales; if missing, add
  en "Confirm?" / fr "Confirmer ?"); second tap within the state deletes; tapping elsewhere
  resets. Keep it dependency-free.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass; `pnpm typecheck` → exit 0.

### Step 5: Navigation honesty

- `nav.ts`: add `{ key: "assistant", href: "/assistant", icon: SparkleIcon }` (import
  `SparkleIcon` from `@phosphor-icons/react/dist/csr/SparkleIcon` — matching the file's
  existing csr imports) so the assistant appears in MORE_NAV.
- Remove the `meals` entry from `NAV_ITEMS` (keep the route file — deep links keep
  working; plan 008 may revive it as a real history page).
- Add the `Nav.assistant` key to both message files (en "Assistant", fr "Assistant").

**Verify**: `grep -n "assistant" apps/web/src/lib/nav.ts` → 1 hit; `grep -c '"meals"' apps/web/src/lib/nav.ts` → 0.

### Step 6: Back links on detail pages

Add a small back link above each detail page's content (catalogue, recipe, product,
recipe-edit): `<Link href="/offers" className="text-xs text-zinc-500 hover:text-brand-700">← {tc("back")}</Link>`
using `Common.back` (exists in both locales — verify with grep; if absent, add
en "Back" / fr "Retour"). Match each page's parent route: recipes → `/recipes`,
products → `/products`, catalogue → `/offers`.

**Verify**: `pnpm lint` → exit 0; `pnpm typecheck` → exit 0.

## Test plan

- No new unit tests required (pure presentational changes); the i18n double-locale rule is
  the regression risk — add one vitest file `apps/web/test/messages-parity.test.ts` that
  parses BOTH message JSON files and asserts an identical top-level key set AND identical
  leaf-key set per namespace (this guards every future plan too). Model file-reading style
  after `apps/web/test/extraction.test.ts`.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0 (incl. new parity test)
- [ ] `grep -n 'title={tc("language")}' "apps/web/src/app/[locale]/(app)/settings/page.tsx"` → no matches
- [ ] `grep -n 'favorite={false}' "apps/web/src/app/[locale]/(app)/recipes/[id]/page.tsx"` → no matches
- [ ] `grep -n 'stores\[0\]!' "apps/web/src/app/[locale]/(app)/shopping/receipts/receipt-uploader.tsx"` → only inside the null-coalescing default, never as the sole source
- [ ] `git status` clean of out-of-scope files; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts.
- `Common.back` / `Common.confirm` missing from either locale AND adding them conflicts
  with an existing namespace shape you can't resolve (report).
- `shopping-item-row.tsx` optimistic pattern doesn't compile when adapted (fall back to
  pending-state-only pantry row — note it in the commit body).

## Maintenance notes

- The messages-parity test is now the guard for ALL future i18n work — reviewers should
  fail any PR that adds a key to one locale only.
- The assistant nav entry is the discovery fix; a dashboard card is plan 008's onboarding
  work.
