# Maqrivo Retailer Adapters (v1 — pending plan approval)

## Boundary

```ts
interface RetailerAdapter {
  readonly id: string;                    // 'carrefour' | 'intermarche' | …
  readonly capabilities: {
    discoverStores: boolean;
    fetchStore?: boolean;
    fetchCatalogues?: boolean;
    fetchPromotions?: boolean;
    fetchPrices?: boolean;
    resolveRetailerProduct?: boolean;
  };
}
```

The ingestion scheduler composes jobs **only** from declared capabilities — capability detection, not fake implementations. Adapters fail independently: a failed Carrefour run never blocks Open Prices or Intermarché jobs, and previously stored data keeps its original timestamps when a refresh fails.

## Adapter inventory (slice + researched)

| Adapter | discoverStores | fetchCatalogues | fetchPromotions | fetchPrices | resolveRetailerProduct |
|---|---|---|---|---|---|
| `CarrefourAdapter` | ✅ verified public eligibility API | 🔬 experimental flag (documented no-login endpoints) | 🔬 via catalogue flag | ❌ (Cloudflare) — Open Prices + user observations instead | 🔬 GTIN-keyed (with catalogue flag) |
| `IntermarcheAdapter` | ❌ (DataDome) — open data covers discovery | ✅ public flipbook host, store-keyed | ✅ extracted from catalogue pages (EXTRACTED status) | ❌ | ❌ |
| `BonialAdapter` | — | — | — | — | **Not built** — programmatic use rejected (CGU, robots); manual entry is the aggregator fallback |

Key: ✅ slice · 🔬 behind config flag with hard backoff · ❌ not attempted.

## Behavioural rules

1. **Politeness budget**: unique identifying User-Agent; per-adapter request caps per run; weekly store refresh, daily catalogue checks per enabled store (not per discovered store — two-tier model).
2. **Hard backoff**: first 403/429 ends the run, marks it failed in `ingestion_runs`, schedules no retry escalation. No browser emulation, no captcha solving, no header spoofing beyond the identifying UA.
3. **Everything cached**: store metadata long-lived; catalogue metadata daily; page content-hash dedup so identical flipbook pages are never re-analyzed by AI.
4. **Provenance by construction**: every catalogue page ingested becomes a `catalogue_pages` row + `source_evidence` entry; every extracted promotion links `catalogue_page_id` + raw text + confidence + `NEEDS_VERIFICATION`, and stays UNRESOLVED at the product level until `ProductResolution` succeeds.
5. **Parser tests**: sanitized fixtures per adapter under `fixtures/`; parsers are pure functions from payload → normalized entities.

## Adding a retailer (iteration protocol)

Research (updated in `docs/research/french-retailers.md`) → document in `docs/data_sources.md` → implement adapter with real capabilities only → fixtures + parser tests → one supervised live run → inspect data quality in the admin view → only then mark supported. Candidates in order: Lidl (public leaflets), E.Leclerc (drive API, DataDome-gated), Monoprix, Franprix, G20.
