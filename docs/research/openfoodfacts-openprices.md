# Data Source Research: Open Food Facts + Open Prices

Research date: 2026-09-04. All claims verified against official documentation or live API calls made on this date. Live-verified items are marked **[live-verified]**. Anything not verifiable from official sources is explicitly flagged as unverified.

Purpose of this document: evaluate the two primary open data sources for Maqrivo (nutrition + grocery price optimization, France-first around Courbevoie/La Défense, app stays location-agnostic).

---

## Source 1: Open Food Facts (product data)

### Name
Open Food Facts (OFF) — run by the non-profit Open Food Facts Association (France).

### Purpose
Open collaborative database of food products (3M+ products): ingredients, nutrition facts per 100g, allergens, Nutri-Score, NOVA, Eco-Score, labels, images. The product-identity backbone for Maqrivo: barcode → product → nutrition.

### Official / third-party
Official. Documentation:
- API docs (primary): https://openfoodfacts.github.io/openfoodfacts-server/api/ — states **v3 (latest sub-version v3.6) is "Current — recommended for all new integrations"; v2 is "Deprecated — still supported for backward compatibility"; v1/v0 legacy, not recommended.**
- API cheatsheet: https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/
- API tutorial: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
- Bulk data: https://world.openfoodfacts.org/data
- Terms/licence: https://world.openfoodfacts.org/terms-of-use
- Wiki (partially behind anti-bot protection during research): https://wiki.openfoodfacts.org/API — could not be fetched directly; wiki-sourced facts below come via the official GitHub Pages docs instead.

### Available data
Verified on a real product (Nutella, EAN-13 `3017620422003`) **[live-verified]**:
- **Identity**: `code` (barcode/EAN), `product_name` (+ per-language `product_name_fr` etc.), `brands`, `brands_tags`, `quantity` (free text, e.g. `"450 G"`), `product_quantity` (numeric, e.g. `450`) and `product_quantity_unit` (`"g"`).
- **Nutriments** (`product.nutriments`, all per 100g unless suffixed): `energy-kcal_100g` (539), `energy_100g`/`energy-kj_100g` (2252 kJ), `proteins_100g` (6.3), `carbohydrates_100g` (57.5), `sugars_100g` (56.3), `added-sugars_100g`, `fat_100g` (30.9), `saturated-fat_100g` (10.6), `salt_100g` (0.107), `sodium_100g`, `nova-group_100g`. Each nutrient also has `_value`/`_unit` companions.
  - `fiber_100g` can be **absent** from `nutriments` and only present in a separate `nutriments_estimated` object (estimated from ingredients) — handle nulls **[live-verified]**.
- **Per-serving data**: `serving_size` (e.g. `"110g"`), `serving_quantity` (numeric grams, e.g. `110`), `nutrition_data_per` (`"100g"` or `"serving"`), and `*_serving` nutriment fields (`energy-kcal_serving`, `proteins_serving`, `carbohydrates_serving`, `sugars_serving`, `fat_serving`, `saturated-fat_serving`, `salt_serving`, `sodium_serving`) **[live-verified on product 6111242103702]**. Many products have NO serving data (nulls) — always compute from per-100g × quantity as fallback.
- **Allergens**: `allergens`, `allergens_tags` (e.g. `["en:milk","en:nuts","en:soybeans"]`), `allergens_hierarchy`, traces, per-language `ingredients_text_with_allergens`.
- **Categories**: `categories`, `categories_tags`, `categories_hierarchy` (taxonomy tags like `en:sweet-spreads`), `compared_to_category`, `category_properties`.
- **Scores**: `nutriscore_grade`/`nutrition_grades`, `nova_group`, `ecoscore_grade`.
- **Images**: `image_url`, `image_small_url`, `image_thumb_url`, `image_front_url` (+`_small_url`, `_thumb_url`), `image_ingredients_url`, `image_nutrition_url`, `image_packaging_url`; full `images` object with sizes (100/200/400/full), revision (`rev`), uploader, crop coordinates. URL pattern: `.../products/301/762/042/2003/front_en.879.400.jpg` **[live-verified]**.
- **EAN handling**: barcode is the resource path; EAN-13 verified. No normalization documented; pass the raw code.

### Geographical coverage
Global database, but coverage varies by country. French products are among the best-covered (OFF originated in France). Not quantified per-country from official docs during this research (unverified beyond general statement).

### Freshness
Community-updated; products have `created_t` / `last_modified_t` timestamps. Nightly full exports and 14-day delta exports exist (https://world.openfoodfacts.org/data). The API always serves live data.

### Reliability
Crowdsourced (with OCR + robotoff AI assistance), quality varies; missing fields are common (e.g. missing serving size or fiber). Products carry `states_tags` and `misc_tags` quality flags (tutorial: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/). Nutri-Score on OFF is the official French formula (relevant for France). Terms page: data provided as-is, no warranty, "must not be used for medical purposes".

### Integration method (concrete endpoints)
Base URL: `https://world.openfoodfacts.org` (staging: `https://world.openfoodfacts.net`, basic auth `off`/`off`).

1. **Read product by barcode (v2, stable & battle-tested)** **[live-verified]**:
   `GET https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name,brands,quantity,serving_size,serving_quantity,nutriments,categories_tags,allergens_tags,image_url`
   Response: `{ "code", "status", "status_verbose", "product": {...} }`.
2. **Read product by barcode (v3, current recommended)** **[live-verified]**:
   `GET https://world.openfoodfacts.org/api/v3/product/3017620422003.json?fields=product_name,nutriments,serving_quantity`
   Response: `{ "code", "status": "success", "result": {"id": "product_found"}, "errors": [], "warnings": [], "product": {...} }`. (`/api/v3.6/product/{code}.json` also returns 200.)
3. **Structured search (v2 only — v3 search not yet implemented)** **[live-verified]**:
   `GET https://world.openfoodfacts.org/api/v2/search?categories_tags=en:chocolate-spreads&fields=code,product_name,brands,quantity&page_size=20`
   Response: `{ "count", "page", "page_count", "page_size", "skip", "products": [...] }`. Filters include tag filters (`categories_tags`, `brands_tags`, `labels_tags`, `nutrition_grades_tags`, ...), `sort_by` (e.g. `last_modified_t`, `popularity_key`), `fields`, `page_size`, `page`.
4. **Bulk barcode lookup** (cheatsheet): `GET https://world.openfoodfacts.org/api/v2/search?code=3263859883713,8437011606013,6111069000451&fields=code,product_name`
5. **Full-text search** — two options: legacy `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=...&search_simple=1&action=process&json=1` (discouraged for new work), or **Search-a-licious**: `GET https://search.openfoodfacts.org/search?q=nutella&page_size=20` **[live-verified]** — returns `{ count, page, page_size, page_count, hits: [...], facets }`; supports `q` filter syntax like `labels_tags:"en:fair-trade"`, `sort_by`, `fields`, `facets` (tutorial: https://openfoodfacts.github.io/search-a-licious/users/tutorial/).
6. **Taxonomies** (categories, allergens, labels, nutrients, packaging materials...):
   - v2 partial fetch **[live-verified format from cheatsheet]**: `GET https://world.openfoodfacts.org/api/v2/taxonomy?tagtype=labels&tags=en:organic,en:fair-trade&fields=name,description,children&include_children=1&lc=en,fr`
   - v3 suggestions: `GET https://world.openfoodfacts.org/api/v3/taxonomy_suggestions?tagtype=categories&lc=fr&string=...`
   - Static full taxonomies: e.g. `https://static.openfoodfacts.org/data/taxonomies/labels.full.json`
7. **Bulk/no-API**: nightly JSONL `https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz`, CSV `https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz`, MongoDB dump, deltas `https://static.openfoodfacts.org/data/delta/index.txt`, Parquet `https://huggingface.co/datasets/openfoodfacts/product-database` (source: https://world.openfoodfacts.org/data).
8. **Write API** (not needed for MVP): requires authentication (username not email + password, or session cookie; `app_name`, `app_version`, `app_uuid` params; `User-Agent` mandatory).

**Rate limits (official)** — https://openfoodfacts.github.io/openfoodfacts-server/api/:
- Reads `GET /api/v*/product`: **15 req/min/IP**; search `GET /api/v*/search` or `/cgi/search.pl`: **10 req/min/IP**. Exceeding can trigger IP bans; global abuse returns 503. For mobile apps limits can apply per user.
- **User-Agent convention (required)**: `AppName/Version (ContactEmail)` e.g. `MyApp/1.0 (myapp@example.com)`.
- **Caching guidance**: for more than a few hundred products use the nightly exports, not API calls; a "Local Caching" tutorial exists in the docs; usage policy: production use OK when "1 API call = 1 real scan by a user"; API-based scraping will be blocked. Notify reuse: reuse@openfoodfacts.org.

### Known limitations
- v2 deprecated (still working); v3 recommended but **v3 has no structured search yet** — search stays on v2 / Search-a-licious (cheatsheet: "/api/v3/search is not yet implemented").
- Sparse data: serving sizes, fiber, packaging often missing; estimates live in separate `nutriments_estimated`.
- Strict rate limits (15/min reads) → must cache locally (own DB keyed by barcode, TTL refresh).
- Wiki docs partially behind anti-bot protection (Anubis) — some wiki pages unfetchable for automated agents; prefer the GitHub Pages docs.
- `page_count` in v2 search responses can be inconsistent with `count` **[observed live]** — rely on `count` + `skip`.

### Legal considerations (licence/attribution)
Source: https://world.openfoodfacts.org/terms-of-use **[live-verified]**:
- Database as a whole: **ODbL 1.0**; individual contents: **DbCL 1.0**; product images: **CC BY-SA 3.0**.
- Attribution required: "mention the licence and to attribute the authorship to Open Food Facts with a link to https://openfoodfacts.org" (or a local version e.g. fr.openfoodfacts.org, or the specific product page). Attribution mandatory for derivative works; contributors credited via link to the contributed product.
- Share-alike: derivative databases must be under the same terms.
- Images may embed third-party rights (packaging artwork, trademarks); terms governed by French law; data must not be used for medical purposes.

### Fallback strategy
- Cache every product fetch locally (own DB); serve stale data when OFF is down or rate-limited; refresh on scan.
- For bulk catalog needs, ingest the nightly JSONL/CSV export instead of hammering the API.
- If a barcode is unknown: OFF flavors (Open Products Facts/Open Beauty Facts `product__source` handling) exist; for Maqrivo MVP show "product not found — add manually" flow (optionally contribute via OFF Write API later, which also fulfils community norms).
- Secondary nutrition source candidates (not researched here): Ciqual (ANSES/France) reference tables for generic foods.

---

## Source 2: Open Prices (crowdsourced grocery prices)

### Name
Open Prices (by Open Food Facts) — https://prices.openfoodfacts.org

### Purpose
Crowdsourced database of grocery product prices (price + store + date + photo proof), collected worldwide via the OFF mobile app ("Smoothie") and web. Maqrivo's price layer: product × store × price observations.

### Official / third-party
Official, same org as OFF. Documentation:
- API docs (interactive): https://prices.openfoodfacts.org/api/docs
- OpenAPI schema: `GET https://prices.openfoodfacts.org/api/schema` (drf-spectacular; **parsed in full during this research**) — code licence listed as AGPL-3.0
- Repo: https://github.com/openfoodfacts/open-prices (API.md, docs/; docs site https://openfoodfacts.github.io/open-prices/)
- Data guide: https://raw.githubusercontent.com/openfoodfacts/open-prices/main/docs/guides/data.md
- Pre-production env for testing scripts: https://prices.openfoodfacts.net (same OFF account, separate token)

### Available data
Endpoints (from the official OpenAPI schema, `/api/v1/` base):
- `GET /api/v1/prices` (filters below), `GET /api/v1/prices/{id}`, `GET /api/v1/prices/{id}/history`, `GET /api/v1/prices/stats` (price__count/min/max/avg), `POST /api/v1/prices` (auth)
- `GET /api/v1/products`, `/api/v1/products/{id}`, `/api/v1/products/code/{code}`
- `GET /api/v1/proofs`, `/api/v1/proofs/{id}` (both readable without auth **[live-verified]**), `POST /api/v1/proofs/upload` (auth), drafts endpoints, flag endpoints
- `GET /api/v1/locations`, `/api/v1/locations/{id}`, **`GET /api/v1/locations/nearby?lat&lon&radius_km`** (returns `distance_km`), `GET /api/v1/locations/osm/{osm_type}/{osm_id}`, `GET /api/v1/locations/osm/countries`, `/api/v1/locations/osm/countries/{country_code}/cities`, `GET /api/v1/locations/compare?location_id_a&location_id_b`
- `GET /api/v1/stats` (global totals), `POST /api/v1/auth` (token), `GET /api/v1/session`, plus badges/challenges/price-tags/flags/users.

**Price observation fields** (schema `PriceFull`, confirmed in live responses):
`id`, `product_id` + nested `product`, `location_id` + nested `location`, `proof_id` + nested `proof`, `type` (`PRODUCT`|`CATEGORY`), `product_code` (barcode), `product_name`, `category_tag`, `labels_tags`, `origins_tags`, `price`, `price_is_discounted` (bool), `price_without_discount`, `discount_type` (`QUANTITY|SALE|SEASONAL|LOYALTY_PROGRAM|EXPIRES_SOON|PICK_IT_YOURSELF|SECOND_HAND|OTHER`), `price_per` (`UNIT`|`KILOGRAM`), `currency` (ISO, `EUR`), `location_osm_id`, `location_osm_type`, `date` (observation date), `receipt_quantity`, `owner_comment`, `owner` (username), `source` (client string), `tags`, `created`, `updated`, `duplicate_of`.

**Key GET /api/v1/prices filters**: `product_code`(+`__in`), `product_id`(+`__in`), `product__categories_tags__contains`, `location_id`(+`__in`), `location_osm_id`, `location_osm_type`, `location__osm_name__contains`, **`lat`+`lon`+`radius_km` (geo, must be sent together)**, `price__gt/gte/lt/lte`, `price_is_discounted`, `currency`, `date`(+`__gt/gte/lt/lte`, `date__month`, `date__year`), `proof__type` (`PRICE_TAG|RECEIPT|GDPR_REQUEST|SHOP_IMPORT`), `kind` (`COMMUNITY|CONSUMPTION`), `owner`, `order_by`, `page`, `size` (max 100, max page 500 per `open_prices/api/pagination.py`).

**Nested product** (subset synced from OFF, schema `ProductFull`): `code`, `source` (`off|obf|opff|opf`), `product_name`, `image_url`, `product_quantity`, `product_quantity_unit`, `quantity`, `categories_tags`, `brands`, `brands_tags`, `labels_tags`, `nutriscore_grade`, `ecoscore_grade`, `nova_group`, `unique_scans_n`, `price_count`, `location_count`, `user_count`. Per docs/topics/open-food-facts-product-data.md: all 4 product flavors stored, subset of fields kept, instant sync via Redis + daily batch, and products can be contributed back to OFF (via the `open-prices` bot user).

### Geographical coverage
**[live-verified 2026-09-04]** `GET /api/v1/stats`: 306,832 prices; 134,864 products with ≥1 price; 7,024 locations (6,891 OSM + 133 ONLINE); 120,912 proofs; 7,785 users; prices in 123 countries. `GET /api/v1/locations/osm/countries`: **France is #1 — 2,440 locations, 207,324 prices (~68% of all prices)**; next: USA 36,866 prices, Norway 20,895, Germany 1,038 locations. Local test around Courbevoie/La Défense (lat 48.8907, lon 2.2389, 2 km): **8 stores, 202 prices; e.g. Carrefour City Puteaux with 168 prices** — good initial density for the pilot area.

### Freshness
Highly fresh where contributors are active: each price carries `date` (user-entered observation date) and `created` (submission timestamp); live submissions from the OFF mobile app appear immediately (test data included prices dated 2026-06-01). Freshness is per-store/per-area — outside active zones data can be months old or absent. `/api/v1/stats` exposes an `updated` timestamp.

### Reliability
Crowdsourced with mandatory **proofs** (photos); moderation/flag system (`POST /api/v1/prices/{id}/flag` with reasons WRONG_PRICE_VALUE, WRONG_LOCATION, etc.), duplicate detection (`duplicate_of`), ML outlier detection (docs/topics/outlier-detection.md), and ML proof-type predictions on each proof. Prices are single observations — average across observations per product/store for stability (use `/api/v1/prices/stats`).

### Integration method (concrete endpoints)
Base: `https://prices.openfoodfacts.org/api/v1` (test first on `https://prices.openfoodfacts.net` per API.md guidance).
1. **Stores near a point** **[live-verified]**: `GET https://prices.openfoodfacts.org/api/v1/locations/nearby?lat=48.8907&lon=2.2389&radius_km=2` → `{ total, page, pages, size, items: [ { id, osm_id, osm_type: "WAY", osm_name: "Carrefour City", osm_brand, osm_address_city: "Puteaux", osm_address_country_code: "FR", osm_lat, osm_lon, price_count, distance_km, type: "OSM" } ] }`
2. **Prices near a point** **[live-verified]**: `GET https://prices.openfoodfacts.org/api/v1/prices?lat=48.8907&lon=2.2389&radius_km=2&size=100&order_by=-created`
3. **Prices for one product**: `GET /api/v1/prices?product_code=3017620422003&size=100&order_by=-date`
4. **Prices for one store**: `GET /api/v1/prices?location_id=5177&size=100&order_by=-date`
5. **Stats**: `GET /api/v1/prices/stats?product_code=...` or `?location_id=...` → `{ price__count, price__min, price__max, price__avg }`
6. **Writes** (if Maqrivo later contributes prices): `POST /api/v1/auth` `{username, password}` → token; send `Authorization: Bearer <token>`. Reads need no auth (verified).
Pagination: `page`, `size` (≤100), `order_by`; response keys `total/pages/items` (custom pagination).

### Store/location model & OSM mapping
Locations are OpenStreetMap objects: `type` (`OSM`|`ONLINE`), `osm_type` (`NODE`|`WAY`|`RELATION`), `osm_id`, plus cached OSM attributes (`osm_name`, `osm_display_name`, `osm_tag_key`/`osm_tag_value` e.g. `shop=supermarket`, `osm_brand`, address fields, `osm_lat`/`osm_lon`, `osm_version`, `website_url`, `osm_brand_logo_url`) and counts (`price_count`, `product_count`, `user_count`, `proof_count`). Resolve any OSM object directly via `GET /api/v1/locations/osm/{osm_type}/{osm_id}`. Per docs/topics/openstreetmap-location-data.md: location data is fetched and stored **at creation time only** (no continuous OSM sync yet; rebranding tracked in issue #1018); frontend store search uses Komoot Photon + Nominatim; brand gaps filled via nsi.guide.

### Proofs (photos)
A proof = the photo evidence for one or more prices: fields `type` (`PRICE_TAG`, `RECEIPT`, `GDPR_REQUEST`, `SHOP_IMPORT`), `file_path` (e.g. `0273/uwZ7W6VQ5G.jpg`), `image_thumb_path` (`...400.jpg`), `mimetype`, `image_md5_hash`, `date`, `currency`, receipt metadata, `price_count`, `owner`, `draft`. **Proofs and their images are publicly viewable** **[live-verified]**: `GET /api/v1/proofs/115286` works unauthenticated; image served at `https://prices.openfoodfacts.org/img/0273/uwZ7W6VQ5G.jpg` (200, image/jpeg; URL construction confirmed in `config/settings.py`: `IMAGES_DIR_DISPLAY = /img`). Privacy note: receipts can contain personal data — don't ingest/store proof images unnecessarily; there is a `DraftProofAnonymizeRequest` flow and flagging.

### Known limitations
- Coverage is contributor-driven: excellent in France (esp. cities), sparse elsewhere; a given small store may have few/no recent prices (verified: several La Défense stores have 1–6 prices).
- Single-observation prices; discounts/promos make raw price distribution noisy — use `price_without_discount` and stats endpoints.
- No documented API rate limits; DRF settings (`config/settings.py`) show no throttle classes (only pagination caps: size ≤ 100, page ≤ 500) — be conservative anyway; not an officially documented "no limits" guarantee (unverified at infra level).
- Location data frozen at OSM creation time (renames/rebrands not synced).
- Prices tied to user-entered `date`, not a guaranteed observation timestamp; `created` is reliable.
- `kind=CONSUMPTION` prices reflect personal purchases; `COMMUNITY` is the default pool (stats: 259,528 of 306,832).

### Legal considerations (licence/attribution)
- **Data: ODbL** (docs/guides/data.md: "Make sure you comply with the OdBL licence, mentioning the source of your data"; avoid combining with non-free data you can't release as open; "contributing back any product you add"). Share-alike obligations apply to derived databases.
- **Code: AGPL-3.0** (OpenAPI info.license; repo LICENSE file ~34.5 KB consistent with AGPL-3.0 text — full text not independently verified).
- Proof photos are user-contributed images (personal data possible) — treat as public but do not republish needlessly.

### Fallback strategy
- France first aligns with the data's strongest coverage; for stores with missing prices, fall back to: user-entered prices (own local data), receipt OCR later, or store catalog/leaflet APIs (not researched here).
- Bulk option instead of API polling: nightly-ish gzipped JSONL dumps `https://prices.openfoodfacts.org/data/prices.jsonl.gz`, `proofs.jsonl.gz`, `locations.jsonl.gz` and HuggingFace dataset `https://huggingface.co/datasets/openfoodfacts/open-prices` (docs/guides/data.md) — good for building a local cache of French prices.
- If Open Prices is unavailable: degrade gracefully to last-known cached prices with explicit "last updated" labels.
- Optionally (post-MVP) contribute Maqrivo user observations back via the authenticated write API — community norm and ODbL give-back expectation.

---

## Key references
- OFF API docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
- OFF cheatsheet: https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/
- OFF tutorial: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/
- OFF data exports: https://world.openfoodfacts.org/data
- OFF terms (licence): https://world.openfoodfacts.org/terms-of-use
- Search-a-licious tutorial: https://openfoodfacts.github.io/search-a-licious/users/tutorial/
- Open Prices API docs: https://prices.openfoodfacts.org/api/docs
- Open Prices OpenAPI schema: https://prices.openfoodfacts.org/api/schema
- Open Prices repo: https://github.com/openfoodfacts/open-prices (API.md, docs/guides/data.md, docs/topics/)
