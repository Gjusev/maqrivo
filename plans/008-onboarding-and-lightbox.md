# Plan 008: Onboarding checklist + in-app leaflet lightbox

> **Executor instructions**: Follow step by step; verify each step. STOP conditions halt
> the plan. Update your row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 13bb4a1..HEAD -- "apps/web/src/app/[locale]/(app)/page.tsx" "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]" "apps/web/src/app/[locale]/(app)/stores/page.tsx"`
> Mismatch vs "Current state" = STOP. Plan 006 adds a digest card to the same dashboard —
> re-read page.tsx first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (lightbox must work on mobile touch)
- **Depends on**: none (soft: after 007 so skeleton/empty states exist)
- **Category**: ux
- **Planned at**: commit `13bb4a1`, 2026-09-07

## Why this matters

Two verified UX gaps: (1) the intended workflow (profile location → enable stores →
catalogues/offers → generate week) is never communicated — a new user hits "generate plan"
and gets an opaque error; the stores empty state doesn't even link to profile location
setup. (2) Reading a leaflet — the core "browse catalogues" activity — means leaving the
app to a raw browser tab with the full 8 MB image (`page-card.tsx:142-150`), jarring on
mobile and session-losing on iOS PWA. This plan adds a prerequisite checklist to the
dashboard and an in-app zoomable lightbox for leaflet pages.

## Current state

- Dashboard `apps/web/src/app/[locale]/(app)/page.tsx`: session-gated; loads active plan,
  shopping plan, nutrition profile (lines 28-51); when no plan exists renders an
  EmptyState with `GeneratePlanButton` (≈:55-67 — read live); pantry-expiring section at
  ≈:93-103. Plan 006 adds a digest card nearby.
- Stores page `stores/page.tsx:70-80`: `DiscoverButton` hidden when user has no location;
  empty state doesn't link to `/profile` (read live lines before editing).
- Profile page has the location editor (`profile/location-editor.tsx` exists).
- Leaflet page image, `page-card.tsx:141-150` (verified):

```tsx
      <a href={`/api/catalogues/pages/${pageId}/image`} target="_blank" rel="noreferrer" className="block bg-zinc-100">
        <img
          src={`/api/catalogues/pages/${pageId}/image`}
          alt={`${t("evidencePhoto")} ${String(pageNumber)}`}
          className="max-h-96 w-full object-contain"
          loading="lazy"
        />
      </a>
```

- The image route streams the ORIGINAL file
  (`api/catalogues/pages/[pageId]/image/route.ts`).
- Modals in the repo are hand-rolled fixed overlays (see `new-catalogue-button.tsx:44-48`
  for the pattern + its accessibility gaps — plan 004 noted them; a shared Dialog is
  ideal but NOT required here; a self-contained lightbox is acceptable).
- Design tokens: `card`, `btn-secondary`, zinc scale, `backdrop-fade` class exists.

## Commands you will need

| Purpose   | Command                           | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                  | exit 0              |
| Lint      | `pnpm lint`                       | exit 0              |
| Web tests | `pnpm --filter @maqrivo/web test` | all pass            |

## Scope

**In scope**:
- `apps/web/src/app/[locale]/(app)/page.tsx` (checklist card)
- `apps/web/src/app/[locale]/(app)/stores/page.tsx` (empty-state link)
- `apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx` (lightbox mount)
- `apps/web/src/components/lightbox.tsx` (create)
- `apps/web/messages/en.json`, `apps/web/messages/fr.json`

**Out of scope**:
- Resizing/thumbnails of stored images (perf plan 011 territory; the lightbox can consume
  the original).
- Tap-a-region-to-select-a-candidate interactions (future; needs model positions).
- Any change to the image API route.

## Git workflow

- Branch: `advisor/008-onboarding-lightbox`
- Commit: `Onboarding checklist + in-app leaflet lightbox`

## Steps

### Step 1: Prerequisite checklist card on the dashboard

In `page.tsx`, compute four booleans from queries you can cheaply add near the existing
profile/plan loads:
- `hasLocation`: profile row has non-null home lat/lng (read the profile schema columns
  via grep; they're whatever location-editor.tsx writes).
- `hasStores`: any row in `userStorePrefs` where `enabled = true` for this user.
- `hasOffers`: any promotion created/updated in the last 14 days (simple count query).
- `hasPlan`: already known (`plan` from :28-35).

Render when NOT all true, ABOVE the main content:

```tsx
<section className="card p-5">
  <h2 className="text-sm font-semibold text-zinc-900">{t("setup.title")}</h2>
  <ul className="mt-3 space-y-2">
    {/* each: CheckIcon (done, brand-600) or CircleIcon (todo, zinc-300) + label + Link */}
  </ul>
</section>
```

Items link to `/profile`, `/stores`, `/offers`, `/week` respectively. Keys under
`Today.setup`: `title` (en "Getting started" / fr "Pour commencer"), `location` (en "Set
your home location" / fr "Définissez votre position"), `stores` (en "Discover and enable
stores" / fr "Découvrez et activez des magasins"), `offers` (en "Wait for catalogues or
add an offer" / fr "Attendez les prospectus ou ajoutez une offre"), `plan` (en "Generate
your first weekly plan" / fr "Générez votre premier plan"). Use
`@phosphor-icons/react/dist/ssr/Check` + `Circle` icons.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Stores empty state links to profile

In `stores/page.tsx`, in the no-location branch (≈:70-80, read live), add under the
existing copy: `<Link href="/profile" className="btn-secondary mt-3 inline-flex">{t("setupLocation")}</Link>`
with `Stores.setupLocation` (en "Set my location" / fr "Définir ma position").

**Verify**: `pnpm lint` → exit 0.

### Step 3: Lightbox component

Create `apps/web/src/components/lightbox.tsx` (client):

```tsx
"use client";
// Fullscreen in-app viewer: tap to open, pinch/scroll-zoom via CSS transform,
// Escape / backdrop tap to close. No dependencies.
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) }
```

Requirements:
- `fixed inset-0 z-50 bg-zinc-900/90 flex items-center justify-center` overlay; backdrop
  is a `<button aria-label={closeLabel}>`.
- `<img>` with `max-h-screen max-w-screen object-contain`, wrapped in a div that tracks
  `scale` state (1–4) and translation (drag): wheel handler adjusts scale (deltaY sign ×
  0.25 steps); pointer events (`onPointerDown/Move/Up` with `setPointerCapture`) pan when
  scale > 1; double-click toggles 1 ↔ 2.5. Apply via `style={{ transform: translate + scale }}`
  with `touch-action: none` on the img.
- `useEffect` keydown listener: Escape → onClose; also lock body scroll while open
  (`document.body.style.overflow = "hidden"`, restore on cleanup).
- Close label from props (caller passes translated string).

**Verify**: `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.

### Step 4: Mount it in page-card

In `page-card.tsx`, replace the `<a target="_blank">` wrapper (lines 141-150) with a
button-styled clickable image that opens the Lightbox:

```tsx
      <button type="button" onClick={() => setZoomed(true)} className="block w-full bg-zinc-100" aria-label={`${t("evidencePhoto")} ${String(pageNumber)}`}>
        <img src={`/api/catalogues/pages/${pageId}/image`} alt={...} className="max-h-96 w-full object-contain" loading="lazy" />
      </button>
      {zoomed ? <Lightbox src={`/api/catalogues/pages/${pageId}/image`} alt={...} onClose={() => setZoomed(false)} /> : null}
```

(`const [zoomed, setZoomed] = useState(false);` — matches the component's existing
hook style.) Keep the raw-URL new-tab escape as a small "open original" text link under
the image if trivial — optional.

**Verify**: `pnpm --filter @maqrivo/web test` → all pass; manual dev check: open a
catalogue page image, pinch/scroll zoom, Escape closes, body scroll restored.

## Test plan

- Manual dev verification covers the lightbox (no jsdom pointer-capture fidelity).
- Messages-parity test (plan 004) guards the new keys.
- Optional pure unit: if you factor the zoom-stepper (`nextScale(current, deltaY)`) into
  an exported function inside lightbox.tsx, add 3 cases to a new
  `apps/web/test/lightbox.test.ts` (clamp at 1 and 4, step direction).

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm --filter @maqrivo/web test` exit 0
- [ ] `grep -n 'target="_blank"' "apps/web/src/app/[locale]/(app)/offers/catalogues/[id]/page-card.tsx"` → no matches (or only the optional original-link)
- [ ] Dashboard renders the checklist when prerequisites are missing (dev check)
- [ ] Both message files contain `Today.setup.*` and `Stores.setupLocation`
- [ ] `git status` in-scope only; `plans/README.md` row updated

## STOP conditions

- Drift vs excerpts (page-card especially — plans 003/004 touch it).
- Pointer-capture behaves inconsistently in your manual test to a degree a small fix
  can't resolve (report the browser + gesture).

## Maintenance notes

- If a shared Dialog component is ever built (plan 004's a11y note), refactor Lightbox to
  use it — the zoom/pan logic is orthogonal and survives.
- The lightbox deliberately consumes the original image; when plan 011 adds derivatives,
  swap `src` for the large derivative and keep the original behind a long-press.
