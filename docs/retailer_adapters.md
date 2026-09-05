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
| `IntermarcheAdapter` | ❌ (DataDome) — open data covers discovery | ✅ **structured** (EAN + prices per zone, no AI) — national; store-keyed needs PDV codes | ✅ same payload (LOYALTY_PRICE mapping) | ❌ | ✅ barcode-EXACT via tryMatchPromotionProduct |
| `LidlAdapter` | ❌ — open data covers discovery | ✅ **structured** (prices, no EAN) — national flyers | ✅ same payload | ❌ | 🔬 name/brand scorer (no EAN in payload) |
| `AuchanAdapter` | ✅ OSM + supermarche.com | ✅ official SSR HTML; structured zones + page fallback | ✅ multibuy/loyalty terms parsed conservatively | ❌ | 🔬 name scorer (CUI is not treated as EAN) |
| `MonoprixAdapter` | ✅ OSM + supermarche.com | ✅ official public Dewib JSON, national grocery campaigns | ✅ EAN + effective/base/unit price + typed terms | ❌ | ✅ barcode-EXACT via tryMatchPromotionProduct |
| `G20Adapter` | ✅ OSM + supermarche.com | ✅ official Spree SSR promotion listing | ✅ EAN + current/old/unit price + conditional terms | ❌ | ✅ barcode-EXACT via tryMatchPromotionProduct |
| `BonialAdapter` | — | — | — | — | **Not built** — programmatic use rejected (CGU, robots); manual entry is the aggregator fallback |

Key: ✅ live-verified · 🔬 best-effort deterministic matching · ❌ unavailable/excluded.

## Behavioural rules

1. **Politeness budget**: unique identifying User-Agent; per-adapter request caps per run; weekly store refresh, daily catalogue checks per enabled store (not per discovered store — two-tier model).
2. **Hard backoff**: first 403/429 ends the run, marks it failed in `ingestion_runs`, schedules no retry escalation. No browser emulation, no captcha solving, no header spoofing beyond the identifying UA.
3. **Everything cached**: store metadata long-lived; catalogue metadata daily; page content-hash dedup so identical flipbook pages are never re-analyzed by AI.
4. **Provenance by construction**: every catalogue page ingested becomes a `catalogue_pages` row + `source_evidence` entry; every extracted promotion links `catalogue_page_id` + raw text + confidence + `NEEDS_VERIFICATION`, and stays UNRESOLVED at the product level until `ProductResolution` succeeds.
5. **Parser tests**: sanitized fixtures per adapter under `fixtures/`; parsers are pure functions from payload → normalized entities.

## Adding a retailer (iteration protocol)

Research (updated in `docs/data_sources.md`, live-verified endpoints) → implement adapter with real capabilities only → fixtures + parser tests → one supervised live parse/run → inspect data quality in the admin view → only then mark supported. Next candidates: Casino proximity brands through the Dewib adapter where prices are actually exposed; Lidl regional catalogues once a user's offer region is known; Intermarché local catalogues once stores carry PDV codes. Excluded by policy: E.Leclerc API (Akamai), Super U (Cloudflare), Franprix (bot wall), Bonial (CGU).
