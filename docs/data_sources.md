# Maqrivo Data Sources (v1 — pending plan approval)

Consolidated from `docs/research/*` (all claims cited there; fetched 2026-09-04). Priority order for prices/promotions per product principle: 1) official retailer information, 2) Open Prices, 3) trusted catalogue aggregator, 4) user observations, 5) manual entries. Substitutions between tiers are never silent — every observation preserves its actual source.

---

## Open Food Facts — product truth

- **Purpose**: barcode/EAN → product identity, brand, categories, ingredients, allergens, per-100 g nutrition, pack size, images.
- **Official** open database (ODbL 1.0 data, DbCL 1.0, images CC BY-SA; attribution link required).
- **Integration**: API **v3** (`/api/v3/product/{barcode}`) for reads — officially recommended for new integrations; **v2 deprecated** but search must use `/api/v2/search` (v3 search "not yet implemented") plus Search-a-licious (`https://search.openfoodfacts.org/search?q=`) for interactive queries.
- **Freshness**: collaborative, evolving; cache imports long (nutrition is stable), refresh on demand.
- **Known limitations**: serving-size fields often absent — always compute from per-100 g × package quantity; fiber sometimes only in estimated fields; data quality varies per product (store source + completeness; never treat as verified).
- **Rate limits**: ~15 reads/min/IP, ~10 searches/min; mandatory `User-Agent: Maqrivo/xx (contact)`; local barcode-keyed cache + nightly JSONL bulk export for warm-up.
- **Fallback**: manual product creation flow when not found.

## Open Prices — observed prices

- **Purpose**: price observations with store, product, date, proof photos; discount fields.
- **Official** Open Food Facts ecosystem project; ODbL; anonymous reads; France is the top-covered country (~207 k of ~307 k prices; ~2 440 stores). Verified live: 2 km around La Défense → 8 stores, 202 prices.
- **Integration**: REST `https://api.openfoodfacts.org/api/v1` (OpenAPI published): `locations/nearby?lat&lon&radius_km`, `prices?lat&lon&radius_km`, filters by store/location/product; fields include `price_is_discounted`, `discount_type`, `price_without_discount` → feeds the promotion pipeline as discount observations. Pagination: page size ≤ 100.
- **Freshness**: per-observation dates; treat as opportunistic — density per store is uneven (most local stores have 1–6 prices). Explicit "observed N days ago" always; write-back deferred post-MVP.
- **Fallback**: user manual price observations (first-class, evidence-attached).

## Store discovery — OSM Overpass + directory fallbacks

- **Overpass API** (`overpass-api.de`, fallback `overpass.private.coffee`): server-side queries `around:radius,lat,lng` with brand regex (handles Carrefour City/Market/Express fragmentation) or `brand:wikidata` equality (Q217599 Carrefour, Q3153200 Intermarché, Q1273376 E.Leclerc, Q3321241 Monoprix, Q151954 Lidl, Q2420096 Franprix; G20 by name). Policy: apps' end-user traffic counts against them — cache 1–4 weeks, grid-snap the query center to the user's `location_granularity_m` (home coords never leave the server), unique User-Agent. Bulk fallback: Geofabrik France PBF.
- **Photon** (komoot): address autocomplete (search-as-you-type, `lang=fr`, lat/lon bias) — proxied + debounced. **Nominatim /reverse** (zoom 18): coordinates → address, cached; public instance max 1 req/s, autocomplete forbidden.
- **supermarche.com**: free ODbL store-directory API (no key) — fallback/complementary store discovery source.
- **Map display**: MapLibre GL JS v6 + **OpenFreeMap** vector tiles (no key, no view limits, no SLA; MapTiler free tier as fallback). Browser receives tiles only; no user data in tile requests.

## Catalogue aggregator — Bonial: evaluated and rejected for programmatic use

Verified: Bonial France aggregates 300+ enseignes with city-level pages and rich JSON-LD (`OfferCatalog`, `SaleEvent`, `Product`/`AggregateOffer` with `priceValidUntil`). However: **no public API, no affiliate program, no syndication product**; CGU restrict to personal non-professional use, ban commercial use and reverse-engineering; robots.txt blocks all data endpoints and leaflet viewers; commercial reuse routed to negotiated partnerships.

**Decision**: Maqrivo does not scrape Bonial (or any aggregator) programmatically — not even "just for personal use". Fallback behavior: users consult leaflets (bonial.fr, retailer apps, paper) and enter promotions manually with evidence photos; those manual promotions use the exact same normalized promotion model as any future official integration.

## French retailer integrations

Detail and citations in `docs/research/french-retailers.md` (verified live 2026-09-04 unless marked).

### Carrefour — first official adapter

- **Store discovery (verified)**: `GET https://www.carrefour.fr/api/eligibility/drive?latitude&longitude&postalCode&city` — public JSON, no auth: store id/ref, banner (HYPER/MARKET/…), distance, weekly opening patterns including Sunday ranges, full holiday exception calendars. robots.txt blocks only `/set-store`, `/get-store`, `/webview`, `/g`, `/b`.
- **Catalogue/product endpoints (second-hand, documented by the CarrefourDriveMCP project)**: no-login endpoints for search (`/s?q=`), autocomplete, `POST /products`, GTIN-keyed product lookups (EANs are first-class). Treated as **experimental capability** behind a config flag: low frequency, unique User-Agent, hard backoff on first 403/429, run marked failed — never escalated to browser emulation or anti-bot circumvention.
- **Drive prices ≠ in-store prices**; Cloudflare Bot Management limits sustained reads → prices at Carrefour come from Open Prices + user observations, not scraping.

### Intermarché — structured catalogue adapter (shipped 2026-09-05)

- Direct site access blocked by DataDome (verified: 403 `x-dd: protected` on all HTML). Maqrivo does **not** bypass it.
- Store discovery via open data instead: OSM (Q3153200), supermarche.com, Open Prices locations.
- **Prospectus catalogues — structured (live-verified 2026-09-05, `apps/web/fixtures/intermarche/`)**: the Aristid/e-catalogues platform behind the official leaflet viewer exposes `https://api-prod-intermarche.e-catalogues.pro/api` with a static public key shipped in the viewer JS bundle (public-by-design; same trust class as the Carrefour eligibility endpoint) plus `Origin`/`Referer` viewer headers. Endpoints: `/catalogs/allV1AndNotLocal` (national list), `/catalogs/{designation}` (numeric id), `/catalogs/{id}/pages` — **pages carry per-zone `product.{ean, price, oldPrice, offerPrice, unitVolumePrice, packaging, subCategory, description3}`**: promotions ingest WITHOUT any AI step, EAN-keyed (barcode-EXACT product matching), loyalty offers mapped to LOYALTY_PRICE. Per-store local catalogues (`/catalogs?codeStore={pdv}`) await PDV codes on stores. First live run: 3 catalogues, 134 promotions (126 with EAN).
- Media host `medias-prod-intermarche.e-catalogues.pro` serves page images publicly without the key (evidence view-source URLs).

### Lidl France — structured flyer adapter (shipped 2026-09-05)

- Schwarz Group leaflet platform, fully public (no auth, no key, CORS-open; live-verified, `apps/web/fixtures/lidl/`): `GET https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/fr-FR` → national flyers with validity dates, then `flyerJson` URL per flyer → `flyer.products` with `{title, brand, price}`. Prices structured, **no EAN** — matching falls to the deterministic name/brand scorer. v1 national flyers only (regional `offer_region` variants later). First live run: 2 flyers, 105 promotions.

### Additional structured catalogue adapters (shipped 2026-09-05)

- **Auchan — official SSR HTML**: `GET https://www.auchan.fr/catalogue/` lists catalogue designations and Paris-local validity epochs; `/catalogue/{designation}?version=V1` embeds page images and `data-product-*` zones. The parser normalizes explicit multibuy/loyalty prices and deliberately rejects zones that expose only €/kg without a pack price. Live verification parsed 83 + 62 structured offers from the two best current food leaflets; a third image-only leaflet falls back to page evidence. The Aristid JSON path remains unused because its access status was inconclusive.
- **Monoprix — official public JSON**: the catalogue app's anonymous Dewib endpoint `GET https://api.rcdss.monoprix.fr/rest/api/promotion/by_department` returns campaign ids, dates, EAN, base/effective prices, unit prices, package text, brand and typed promotion terms. The adapter requests only `epicerie-salee` and `epicerie-sucree`, 48 items each; live verification parsed 96 EAN-keyed grocery offers without evaluating the Nuxt payload. Petit Casino/Spar/Vival share the platform but price coverage is partial and remains deferred.
- **G20 — official Spree SSR HTML**: `GET https://www.g20-minute.com/taxons/promotions` exposes product EANs, visible current/old prices, integer basket cents, €/kg, loyalty flags and promotion descriptions. Live verification parsed 21 EAN-keyed offers: 6 second-unit discounts, 11 loyalty credits and 4 direct percentage offers.

### Excluded/deferred chains (re-verified 2026-09-05)
- **E.Leclerc — excluded (API)**: viewer API `nos-catalogues-promos-v2-api.e.leclerc` returned 200 once then Akamai 403s — no-bypass policy excludes it. Listing HTML + manual consultation remain.
- **Super U — excluded**: catalogue detail pages sit behind a Cloudflare JS challenge.
- **Franprix — excluded**: robots.txt itself is bot-walled (403).

### Open Prices — write-back (verified 2026-09-05, not yet wired)

`https://prices.openfoodfacts.org/api/v1` (pre-prod `prices.openfoodfacts.net`, separate token): `POST /auth` (username/password form) → Bearer token; `POST /proofs/upload` (multipart, `type` ∈ PRICE_TAG/RECEIPT/…, returns proof id); `POST /prices` requiring `proof_id` + (`product_code` XOR `category_tag`) + `price`, `price_per`, `currency`, `date`, location (OSM id/type or location id), optional discount fields, `source: maqrivo`. ODbL — attribution + share-back. Implementation awaits the user's OFF credentials (off by default), then: receipt confirmations push as type RECEIPT proofs.

### Principles (all adapters)

Official/public pages only; never bypass auth, CAPTCHA, anti-bot, or private APIs; capability flags per adapter — no empty adapters; one retailer failing never blocks others; structured data preferred over scraping; extracted promotions carry evidence + confidence and never start as verified truth; CGU extraction bans are the main legal exposure (CJEU Ryanair C-30/14) — hence conservative frequencies, caching, and the manual-entry backbone.

## Z.AI (runtime AI provider — not a data source)

See `docs/ai.md` and ADR-0004: general pay-as-you-go API only; the Coding Plan is contractually barred from backing applications.
