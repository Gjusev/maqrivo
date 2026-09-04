# French Retailers — Public Data Access Research for Maqrivo

**Date:** 2026-09-04
**Scope:** Public data access (stores, prices, promotions, identifiers) for French supermarket chains, priority on **Carrefour France** and **Intermarché France**, brief on E.Leclerc, Lidl, Monoprix, Franprix, G20.
**Method:** Public pages only — WebSearch, WebFetch, single polite `curl` GETs of robots.txt / public JSON endpoints, live queries of the Open Prices public API (an open-data API designed for programmatic access). No logins, no CAPTCHA/anti-bot bypass, no credential endpoints. Where a site blocked fetching, we noted it and moved on.
**Legend:** **VERIFIED** = read directly from the primary source by us today. **SECOND-HAND** = from search results, third-party services, or open-source project documentation — not read on the primary page by us.
**Related docs:** `docs/research/aggregators.md` (Bonial, Promocatalogues…), `docs/research/osm-ecosystem.md`.

---

## Cross-cutting: Open Prices (Open Food Facts) — the open baseline

Verified live today via the public REST API (no auth for GET):

- **Base URL:** `https://prices.openfoodfacts.org/api/v1/` — working endpoints (HTTP 200): `locations`, `prices`, `products`, `proofs`, `stats`. OpenAPI schema at `https://prices.openfoodfacts.org/api/schema` (OpenAPI 3.0.3, license AGPL-3.0 for the API). [VERIFIED]
- **Docs / project:** https://openfoodfacts.github.io/open-prices/ and repo https://github.com/openfoodfacts/open-prices. Adding prices requires an Open Food Facts account + Bearer token; **reading requires no auth**. Data license **ODbL** (attribution; no mixing with non-open data; contribute back). [VERIFIED — docs + API guide]
- **Price record fields (VERIFIED sample):** `price`, `price_is_discounted`, `price_without_discount`, `discount_type`, `price_per`, `currency: EUR`, `date`, `product_code` (EAN-13, e.g. `3229820100234` with OFF product name + image), plus full `location` object (OSM id/type, lat/lon, postcode, city, country) and `proof` metadata (receipt/price-tag image reference, `type`, `ready_for_price_tag_validation`…).
- **Store = "location":** OSM-based (type `OSM` = physical store) or `type: ONLINE` (drive/online) — the enum exists in the schema, letting consumers separate in-store from online prices. [VERIFIED — schema enum `OSM`/`ONLINE`]
- **Useful filters (VERIFIED):** locations: `osm_name__like`, `osm_address_city__like`, `osm_address_country__like`, `price_count__gte`, `type`, pagination `page`/`size`. Prices: `location_id`, `location_id__in`, `location_osm_id`, `product_code`-family filters, `date__gte/lte`, `discount_type`, `currency`, `order_by`. (Note: `location__osm_name__contains` is listed in the schema but returned 0 for us with an unaccented prefix — filter by `location_id` instead.)
- **French coverage measured today (VERIFIED):**
  - `osm_name__like=Intermarché` + France → **203 locations**; e.g. location_id=10 (Intermarché Grenoble) has **3,857 prices**.
  - `osm_name__like=Carrefour` + France → **374 locations**, of which **54 have ≥100 prices** (e.g. Carrefour Villeurbanne 1,735; Carrefour Market Paris 674: 1,000+).
  - Caveat: coverage is crowd-dependent and uneven; many price rows are dated 2023–2024, a few stores dominate. Good for price *history/level*, weak for *today's* shelf price.
- **Relevance:** chain-agnostic, legal (ODbL), no anti-bot, EAN-keyed, per-store. It is the only fully sanctioned source of per-store French prices found in this research.

---

## 1. Carrefour France (carrefour.fr) — deep dive

### Store discovery
- **Public JSON XHR endpoint (VERIFIED — the single best find of this research):**
  `GET https://www.carrefour.fr/api/eligibility/drive?latitude=45.77668&longitude=3.07722&postalCode=63000&city=Clermont-Ferrand&page=1&limit=3`
  with headers `x-requested-with: XMLHttpRequest`, `accept: application/json` → HTTP 200 JSON, no login, no cookies. Returns `data[]` per store: `id` ("7631"), `name` ("Market Clermont-Ferrand Jaude"), `ref` ("575"), `displayableUrlId`, `distance`, `banner` (MARKET / presumably HYPER etc.), `openingWeekPattern` (date-bounded weekly time ranges incl. separate Sunday hours) and `exceptionCalendars` (per-holiday open/closed + special hours, e.g. "Jour de l'an" closed, "Lundi de Pâques" 08:30–18:00). Despite the `/drive` name it returned a `Market` banner store → usable to discover store fleets around a point, with coordinates + hours. [VERIFIED 2026-09-04; endpoint first documented in the CarrefourDriveMCP repo tool `get_eligible_drive_stores.json` with `"requires_auth": false` — SECOND-HAND for the general catalogue]
- Other documented store-ish endpoints (SECOND-HAND, same repo): `GET /api/favoritestore`, `POST /api/information-insert/stores/{store_id}`, `GET /api/checkout/recommendations/{facility_id}/{basket_service}`.
- Store-locator UI at https://www.carrefour.fr/nos-magasins (returned 403 to WebFetch — see Technical access). Store pages are indexed by Google (store URLs exist under carrefour.fr), SECOND-HAND via search results.

### Prices availability
- Carrefour Drive (courses en ligne) product search/price endpoints documented by CarrefourDriveMCP as working **without an account** (cart/checkout/loyalty need login): `GET /s?q=…` (search page), `GET /autocomplete?q=`, `POST /products` + `GET /products/query/{query_id}`, `GET /navigation`, `POST /api/marketing/{placement}`. [SECOND-HAND — https://github.com/maximeallanic/CarrefourDriveMCP]
- We could not verify prices directly: our single `GET /s?q=pates` returned **HTTP 429** (throttled); `/nos-magasins` 403 via WebFetch; homepage 200 via curl — protection is selective (Cloudflare Bot Management scores per path/client). [VERIFIED status codes]
- Prices are Drive prices (online), displayed after store context is set (`/set-store`-style session) and typically differ from in-store hypermarket/market shelf prices; discount/loyalty prices partially require login. [SECOND-HAND/common knowledge — not verifiable without browser session]

### Promotions / catalogues
- Official catalogue portal: https://www.carrefour.fr/catalogue/carrefour ("catalogues Carrefour Hypermarché de la semaine"). [SECOND-HAND — URL from search; page returned HTTP 200 but empty body to curl (JS app), so format (flipbook vs product grid) UNVERIFIED]
- Catalogue aggregators mirror Carrefour leaflets with validity dates — see `docs/research/aggregators.md` (Bonial `OfferCatalog`/`SaleEvent` JSON-LD with start/end dates; Cataloguemate "dates de validité"). [VERIFIED in the aggregators research]
- robots.txt disallows `/g` and `/b` (likely catalogue/leaflet viewer paths) for all bots. [VERIFIED]

### Identifiers (EAN)
- Carrefour's own endpoints are EAN-keyed: tools `get_products_by_gtins`, `add_item_to_cart_by_ean`, `GET /product/{ean}/reviews`. [SECOND-HAND — CarrefourDriveMCP tool files, e.g. https://github.com/maximeallanic/CarrefourDriveMCP/tree/main/tools]
- Corroborated by Open Prices holding Carrefour-brand products by EAN (e.g. `3229820100234`). [VERIFIED]

### Technical access
- **Cloudflare Bot Management / managed challenge.** CarrefourDriveMCP's measurements: Node `fetch` → immediate 403; `curl` → works briefly then fails; Chrome → 200. Login page adds Cloudflare Turnstile. Their workaround is a windowless real Chromium with masked UA — i.e. **real-browser automation is required for sustained access**. [SECOND-HAND — README, https://github.com/maximeallanic/CarrefourDriveMCP] Our observations match: WebFetch 403 on `/nos-magasins`, curl 200 on `/`, curl 429 on `/s` (rate limit) within a handful of requests. [VERIFIED]
- **robots.txt (VERIFIED — https://www.carrefour.fr/robots.txt):** `User-agent: *` disallows only `/set-store`, `/get-store`, `/webview`, `/g`, `/b`; Google ads bots get explicit Allow on `/set-store`, `/get-store`, `/g`. No sitemap, no crawl-delay. **Product and store pages are NOT disallowed** — catalog browsing is permitted to well-behaved crawlers; only session/leaflet-viewer paths are blocked.
- Platform: rich in-house JSON XHR API on www.carrefour.fr (documented above), ForgeRoom SSO on moncompte.carrefour.fr, `ocb.carrefour.fr` for AI prompts. [SECOND-HAND]

### Legal / ToS
- CGU: https://www.carrefour.fr/conditions-generales-utilisation (behind Cloudflare for us). Carrefour Group CGU clause (quoted by search): *"Toute extraction ou réutilisation, totale ou partielle desdites bases et de leur contenu est ainsi interdite sans l'autorisation préalable"* — classic sui generis database + extraction ban. [SECOND-HAND — https://www.carrefour.com/fr/conditions-generales-utilisation (page 404 to curl today; quote from search snippet)]
- Legal analysis in the cross-cutting Legal section below.

### Suitability verdict for Maqrivo
**Recommended first chain for STORE DISCOVERY, second for prices.**
- **Adapter strategy: "official site public JSON"** for the store network (`/api/eligibility/drive` — verified public, no auth, rich hours/holiday data) + **Open Prices for prices** (ODbL, legal) + aggregator/official catalogue for promos (manual/JSON-LD dates).
- Direct Drive-price fetching requires a real-browser session (Cloudflare) and per-store context; treat as a later, riskier stage with strict rate limits; observe 429 back-pressure. Do NOT automate anything behind login.

---

## 2. Intermarché France (intermarche.com) — deep dive

### Store discovery
- **Store page URL pattern (VERIFIED via Google-indexed URLs in search results):** `https://www.intermarche.com/magasins/{storeId}/{citySlug}-{postcode}/infos-pratiques`, e.g. `/magasins/08160/saint-jean-de-monts-85160/infos-pratiques`, `/magasins/11659/paris-75013/infos-pratiques`, `/magasins/08074/paris-75010/infos-pratiques`. The numeric segment (e.g. `08160`, `11659`) is the store/"pdvref" id; pages carry address, phone, opening hours, Drive/home-delivery availability per search snippets. [VERIFIED pattern via indexed URLs; page content itself SECOND-HAND — pages are DataDome-blocked to us]
- **robots.txt explicitly ALLOWS crawlers on `/magasins/*/*/infos-pratiques`** while disallowing the rest of `/magasins/*` and `/localisation/*` (the locator). So Intermarché *wants* store info pages indexed: they are the sanctioned public surface. [VERIFIED — https://www.intermarche.com/robots.txt]
- Store locator UI ( `/localisation/`) and its XHR (`/api/*`, disallowed in robots) exist but are not reachable by polite automation (see Technical access). No public store-list JSON found in any public project.

### Prices availability
- Intermarché Drive lives on the same domain (`drive.intermarche.com` → 301 → `www.intermarche.com`); product pages/prices require selecting a store (`?pdvref=` parameter, disallowed in robots). [VERIFIED redirect + robots; price behavior SECOND-HAND]
- We could not verify any price programmatically: every HTML page returns DataDome 403. Third-party scrapers confirm store-level prices exist behind that wall: Apify "Intermarché FR Scraper" markets *"products, prices, unit prices and EAN barcodes"*. [SECOND-HAND — https://apify.com/studio-amba/intermarche-fr-scraper]
- Intermarché stores are independent retailers (les Mousquetaires) → prices are genuinely per-store; national prices do not exist. [SECOND-HAND/common knowledge]
- **Open Prices fallback: strong** — 203 Intermarché locations; the Grenoble store carries 3,857 crowd-sourced prices (receipts/labels). [VERIFIED]

### Promotions / catalogues
- Official portal: https://www.intermarche.com/catalogues — *"Choisissez le vôtre pour consulter les prospectus de votre magasin"* → **store-specific** prospectus (per pdvref, e.g. `/catalogues?pdvref=01066`). robots.txt disallows `/catalogues/*` and `/catalog/*` and `*?pdvref*` for crawlers. [VERIFIED robots; portal content SECOND-HAND — blocked to fetch]
- The flipbook reader is hosted on **https://layout-prod-intermarche.e-catalogues.pro/** (e-catalogues.pro platform) — **HTTP 200, public, not DataDome-walled** (at least the reader host). Leaflets are page images; validity dates shown in aggregators (Cataloguemate/Promoaccro), format on the reader itself not inspected beyond the root. [VERIFIED root status 200; content details SECOND-HAND]
- National vs store: promos are store-specific by construction (independent retailers). Loyalty-card pricing exists but requires account access — out of scope.

### Identifiers (EAN)
- Claimed by the Apify commercial scraper (EAN barcodes from intermarche.com product pages). [SECOND-HAND] Open Prices Intermarché prices carry EAN `product_code`. [VERIFIED]

### Technical access
- **DataDome, hard block.** `curl` homepage → **HTTP 403 with response header `x-dd: protected`**; WebFetch of store and catalogue pages → 403. Only robots.txt was served to automation. [VERIFIED]
- Site is Next.js (`/_next/*` disallowed in robots); API under `/api/*` (disallowed + DataDome). [VERIFIED robots signals]
- Commercial bypass services exist (scrape.do advertises DataDome clearing for Intermarché) — **not usable under Maqrivo's no-bypass policy**. [SECOND-HAND — https://scrape.do/industries/ecommerce/intermarche-scraper/]
- No public open-source endpoint documentation found for Intermarché (unlike Carrefour/Leclerc). Closest GitHub: raphaelsty/intermarche (a 2018 sales-prediction data-science challenge, not a scraper). [SECOND-HAND — https://github.com/raphaelsty/intermarche]

### Legal / ToS
- CGU at https://www.intermarche.com/informations-legales/conditions-generales-utilisation (editor: ITM ALIMENTAIRE INTERNATIONAL). [SECOND-HAND — URL via search; page blocked to fetch]
- robots.txt shows deliberate enclosure of `/api/*`, catalogues and search for machines. [VERIFIED]

### Suitability verdict for Maqrivo
**Not feasible as a direct first integration.** DataDome blocks all automated HTML/API access; even store info pages (robots-allowed) 403 to non-browser clients.
- **Adapter strategy: "Open Prices + catalogue-reader host"** — stores via Open Prices/OSM (or a one-time manual seed from indexed `infos-pratiques` pages in a real browser), prices via Open Prices, promos via the public e-catalogues.pro reader host (store keying via pdvref) or aggregator dates. Direct site access only as a manual, human-in-the-browser fallback.

---

## 3. E.Leclerc (brief)

- **Best-documented OSS evidence of any French drive** (verified content of `docs/api-capture.md`): store locator API `https://api-recherchemagasins.leclercdrive.fr/API_RechercheMagasins/api/v1` — `GET /autocomplete?search={postal|city}&provider=Woosmap` → `GET /autocomplete/coordinates?id=…` → `GET /MapPoint/nearby?latitude=&longitude=&postalCode=` returning `noPL` (store id), `serviceType`, `urlSiteCourse` (per-store hosts like `fd9-courses.leclercdrive.fr`; Leclerc drives are per-store ASP.NET sites). Product search is server-rendered `recherche.aspx?TexteRecherche=…` with embedded JSON blobs: `iIdProduit`, `nrPVUnitaireTTC`, `sPrixUnitaire`, `sPrixPromo`, `nrPVParUniteDeMesureTTC`, stock `iQteDisponible`; images at `fd9-photos.leclercdrive.fr/image.ashx?id=…`. [SECOND-HAND — https://github.com/skunkobi/mcp-leclerc-drive/blob/main/docs/api-capture.md]
- **But DataDome active** on `.leclercdrive.fr` (locator included): Node fetch 403 even with fresh browser cookie; bursts get struck; author runs requests through real Chrome via CDP; session is pinned to one drive. [SECOND-HAND — same doc]
- Verdict: richest structured drive data (price fields incl. promo + per-unit), but DataDome makes it a browser-automation-only target, like Intermarché. Store-locator API could be probed politely if ever needed.

## 4. Lidl France (brief)

- **Catalogues are public and clean (VERIFIED):** https://www.lidl.fr/c/catalogues-en-ligne/s10017753 loads without login; leaflets are **page images** served via `imgproxy.leaflets.schwarz`; **validity dates visible per catalogue** ("Du 03/09 au 09/09", "Du 10/09 au 16/09", Foire aux Vins 03/09–10/09); weekly cycle Thursday→Wednesday explained in FAQ. **National** catalogues (no per-store variant).
- robots.txt (VERIFIED — https://www.lidl.fr/robots.txt): disallows `/user-api/*`, `/cqe/*`, search/param URLs; has a sitemap. Product pages of the non-food online shop are crawlable in principle.
- **No food e-commerce/prices in France** (no Drive; Lidl Plus app is loyalty-only). Price data therefore only via Open Prices (crowd) or catalogue images (OCR).
- Verdict: good **catalogue-only adapter** (public, dated, national); no per-store prices to be had legitimately.

## 5. Monoprix (brief)

- robots.txt (VERIFIED — https://www.monoprix.fr/robots.txt): Salesforce Commerce Cloud **Demandware** platform — disallows `/on/demandware.store/…`, `/dw/shop/v…` (the OCAPI JSON API), `/search/`, cart/checkout/account. Product/category pages otherwise crawlable. No sitemap listed.
- Implication: a standard, well-understood e-commerce platform with a JSON API path that the merchant deliberately excludes from crawling. Monoprix (Casino group) online prices require store/postcode context; not verified further.
- No public OSS documenting Monoprix endpoints found (only commercial scrapers, e.g. datashaker.io/monoprix). [SECOND-HAND]
- Verdict: possible polite-HTML adapter later; treat `/dw/shop/` as off-limits per robots.

## 6. Franprix (brief)

- Even `robots.txt` returned a **403 bot-block page** (blocksrc.haplat.net "sbu" wall — CDN-level bot filtering). [VERIFIED]
- Franprix (Casino group) courses en ligne exist (franprix.fr); nothing public verified. No OSS found.
- Verdict: hostile to automation; Open Prices/OSM only.

## 7. G20 (brief)

- Online shop is **G20 Minute**: https://www.g20-minute.com — robots.txt **fully permissive** (no Disallow; sitemap `sitemap.xml`) and the promotions listing `/taxons/promotions` returned **HTTP 200 public** (the `/taxons/` path is a Spree Commerce convention → likely a standard crawlable product/promo site). [VERIFIED robots + status]
- Chain of ~130 independent supermarkets (Diapar central buying), official site https://www.supermarchesg20.com. [SECOND-HAND]
- Also listed on Uber Eats/Deliveroo with visible prices — platform ToS forbid scraping; not recommended. [SECOND-HAND]
- Verdict: small but **the most scraper-friendly official site** of the six; worth a prototype if G20 coverage matters in the user's area.

---

## Cross-cutting Legal / ToS considerations (France/EU)

1. **Sui generis database right** — Directive 96/9/EC art. 7, transposed in France at **CPI art. L341-1**: extraction/reutilization of a *substantial part* of a database requiring substantial investment can be enjoined. A full drive catalogue (10⁴–10⁵ priced items, verified/updated daily) plausibly qualifies; a handful of prices for a user's shopping list does not. [SECOND-HAND — https://www.app.asso.fr/centre-information/base-de-connaissances/code-bases-de-donnees/la-protection-du-contenu-par-le-droit-sui-generis/conditions-de-la-protection, https://www.deshoulieres-avocats.com/droit-sui-generis-comment-proteger-votre-base-de-donnees/]
2. **CJEU, 15 Jan 2015, C-30/14 Ryanair v PR Aviation** — a *price-comparison* target: Ryanair's flight-price database was protected neither by copyright nor sui generis (no substantial investment in *obtaining/verifying* data it creates itself), **but** for databases outside the directive, the owner may rely on its **terms of use** (contract) to bar scraping, within national mandatory law. Practical consequence for Maqrivo: French retailers' CGU extraction bans (Carrefour: "Toute extraction ou réutilisation… interdite") are the main legal exposure, ahead of database rights. [SECOND-HAND — https://eur-lex.europa.eu/legal-content/DA/ALL/?uri=CELEX:62014CJ0030, https://www.lexing.law/avocats/base-de-donnees-ryanair/2015/01/28/, https://www.revuegeneraledudroit.eu/blog/decisions/cjue-15-janv-2015-c-30-14-ryanair-ltd-c-pr-aviation-bv/]
3. **Facts vs databases** — individual prices are facts (not copyrightable); the risk sits in *scale and method*: bulk extraction, circumvention of technical measures (DataDome/Cloudflare — also potential "fraudulent access" under French criminal law, CPC art. 323-3 line of cases), and CGU breach. Maqrivo's policy (never bypass auth/CAPTCHA/anti-bot; low-volume, user-scoped queries) keeps it in the low-risk zone. [SECOND-HAND — https://www.lexing.law/avocats/web-scraping-vs-producteur-de-base-de-donnees/2025/09/05/]
4. **robots.txt** is a courtesy signal, not law, but it documents the operator's intent and is respected throughout this research (Carrefour: only session/leaflet paths blocked; Intermarché: api/catalogues/search blocked, store info pages explicitly allowed; Lidl/Monoprix: platform paths blocked). [VERIFIED robots files]
5. **GDPR:** prices/stores involve no personal data; we never touch logged-in loyalty data (which would also raise account-ToS issues). Open Prices (ODbL) carries clear attribution/share-back duties — include "data: Open Prices (Open Food Facts), ODbL" in the app.
6. **Anti-bot as de facto boundary:** Cloudflare (Carrefour) and DataDome (Intermarché, Leclerc) mark the line where the operator has technically expressed refusal. Maqrivo must not cross it programmatically; browser-assisted *manual* use by the human user remains their right as a consumer.

---

## Ranking for the FIRST retailer integration (summary)

1. **Carrefour** — verified public store JSON + rich catalogue of documented no-auth catalog endpoints + permissive robots; obstacle: Cloudflare for sustained product-price reads. Best effort/ratio.
2. **G20** — trivially open official shop (permissive robots, public promos pages) but tiny coverage.
3. **Lidl** — easy national catalogues; no prices.
4. **Intermarché / E.Leclerc** — richest per-store price semantics but DataDome-walled; Open Prices only.
5. **Monoprix / Franprix** — blocked or platform-enclosed; Open Prices only.

For every chain, **Open Prices (ODbL)** is the only lawful, stable, per-store price backbone today; official-site adapters add store networks, opening hours and current promos on top.
