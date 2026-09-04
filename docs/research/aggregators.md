# Catalogue / Promotion Aggregators — Research for Maqrivo

**Date:** 2026-09-04
**Scope:** Promotion/leaflet discovery sources usable (or not) by Maqrivo, a personal grocery-optimization app used around Courbevoie / La Défense (92), France.
**Method:** Public pages only (WebSearch, WebFetch, single polite curl GETs of public HTML for JSON-LD verification). No logins, no CAPTCHA bypass, no bulk crawling.
**Legend:** VERIFIED = read directly from the primary source. SECOND-HAND = from search results/press, not read on the primary page.

---

## 1. Bonial France (bonial.fr)

- **Name:** Bonial SAS / bonial.fr (app "Bonial – Promos & Catalogues")
- **Purpose:** Aggregates retailer catalogues (prospectus) and promo offers, browsable by retailer, category, product, and city/location; drive-to-store retail media platform. [VERIFIED — https://www.bonial.fr/]
- **Ownership:** Bonial SAS, 117 quai de Valmy, 75010 Paris, RCS Paris 538 704 248; subsidiary of Bonial International GmbH (Berlin), majority-owned by Axel Springer. Founded in Germany 2008 as kaufDA; Axel Springer took 74.9% in 2011 (~$40M). In 2025 Axel Springer folded cmmrcl.ly into Bonial to build a retail-media data hub. [VERIFIED — https://www.bonial.fr/CGU (corporate data); SECOND-HAND — https://www.bonial.com/en/company, https://techcrunch.com/2011/03/02/axel-springer-acquires-majority-stake-in-kaufda-mobile-coupons-startup-for-40-million/, https://ppc.land/bonial-buys-cmmrcl-ly-to-build-a-retail-media-data-powerhouse/]
- **Available data:**
  - 300+ French enseignes (Carrefour, Leclerc, Intermarché, Auchan, Lidl, Monoprix, Super U, Action, Aldi, Grand Frais, Picard, etc.). [VERIFIED — https://www.bonial.fr/]
  - **Catalogue-level structured data (JSON-LD, public SEO pages):** retailer pages (`/Enseignes/{retailer}`) embed `schema.org/OfferCatalog` of `SaleEvent` items with `startDate`, `endDate`, catalogue `name`, and a preview image URL (`content-media.bonial.biz/.../preview.jpg`). [VERIFIED — curl of https://www.bonial.fr/Enseignes/Carrefour, 2026-09-04]
  - **Product-level structured data (JSON-LD, public SEO pages):** promo pages (`/Promos/{product}`) embed `schema.org/Product` + `AggregateOffer` with `priceCurrency: EUR`, **`lowPrice`** (e.g. 1.5), **`offerCount`** (e.g. 16), **`priceValidUntil`** (e.g. 2026-09-06), product name, product images, and the retail chain as `manufacturer`. Example seen: Nutella promos referenced to "Intermarché Hyper". [VERIFIED — curl of https://www.bonial.fr/Promos/Nutella, 2026-09-04]
  - Geographical scoping: city pages exist and link to per-city catalogues (e.g. `/Courbevoie/Catalogues-en-cours`; page contains postal codes 92400/92300/92100 area codes). Precise "my store / my postcode" filtering is session-based (app geolocation or web session), not a documented public URL parameter. [VERIFIED — curl of https://www.bonial.fr/Courbevoie and https://www.bonial.fr/robots.txt (`/sessionData`, `/portal/` disallowed)]
  - The actual leaflet viewers (`/Catalogue/...`, `/mv/`, `/brochure-viewer/brochure`) are page-image viewers; product data inside them is served by internal endpoints explicitly disallowed to robots. [VERIFIED — https://www.bonial.fr/robots.txt]
- **Integration method:** **None public.** No developer API, no documented partner/affiliate API, no content-syndication product for third parties on the corporate site (B2B products are Bonial Media / Bonial Reach — ad products for retailers and agencies). The CGU names "Partenariats Editeurs" (publisher partnerships) as the only channel for any commercial reuse; access is by contact only, aimed at media/publisher partners, not individuals. [VERIFIED — https://www.bonial.fr/CGU ; https://corporate.bonial.com/]
- **Legal considerations:**
  - CGU: service reserved to French individuals for "personal, non-professional" use; "Toute utilisation à titre et à finalité professionnels et notamment commerciales, est interdite"; bans fraudulent access/perturbation of the site and reverse-engineering ("tenter d'accéder aux codes source … et effectuer de l'ingénierie inverse"); reproduction beyond personal use "constitue une contrefaçon". [VERIFIED — https://www.bonial.fr/CGU]
  - robots.txt: `crawl-delay: 2`; Disallow: `/Catalogue/`, `/mv/`, `/brochure-viewer/brochure`, `/*/*/ajax/`, `/dyn/`, `/api/febe/`, `/api/frontend/`, `/sessionData`, `/portal/`, `/webapp/`, `/shelf`, `/contentViewer/`, `/search`. I.e., all data endpoints and viewers are off-limits even to well-behaved crawlers; only SEO pages are crawlable. [VERIFIED — https://www.bonial.fr/robots.txt]
  - French/EU context: scraping against CGU can be opposed contractually (CJEU Ryanair v Booking.com line of cases); database sui-generis right (Code de la propriété intellectuelle L341-1, from the 1986 law / EU directive 96/9/EC) protects substantial extractions; Code pénal art. 323-3 sanctions fraudulent data extraction; CNIL imposes GDPR conditions when personal data is scraped. [SECOND-HAND — https://datadome.co/fr/learning-center/cgu-protection-web-scraping/, https://www.app.asso.fr/preuve-digitale/web-scraping-legal.html, https://aumans-avocats.com/scraping-donnees-personnelles/, https://www.cnil.fr/fr/focus-interet-legitime-collecte-par-moissonnage]
- **Suitability for Maqrivo:** NOT suitable as a sanctioned integration. No API; CGU + robots.txt actively exclude third-party programmatic use; the data Maqrivo would need (per-store, per-product promo prices) lives behind disallowed endpoints and inside image-based leaflets. The public JSON-LD (`SaleEvent` dates, `AggregateOffer.lowPrice` on `/Promos/` pages) is catalogue/product-brand level, unscoped to a specific store, and reading it programmatically is still governed by CGU that permit only personal consultation.
- **Fallback role:** Manual/fallback discovery only — the human user can check bonial.fr (or its app) to learn that "Carrefour's wine fair runs Sept 7–21" and type that into Maqrivo. As a machine source it is off-limits for anything beyond strictly personal, low-volume consultation.

---

## 2. Promocatalogues.fr (folderz network)

- **Name:** Promocatalogues.fr (+ ~30 sister sites: folderz.nl, prospektangebote.de, catalogueoffers.co.uk, adspecials.us…)
- **Purpose:** Catalogue/promo aggregator site + app since 2016; daily collection of catalogues, promos, weekly offers. [VERIFIED — https://www.promocatalogues.fr/]
- **Available data:** French supermarkets (Carrefour, Leclerc, Intermarché, Super U, Lidl, Aldi, Auchan…) and specialists; brand/offer pages (/offres/…). Retailers can submit catalogues via "Publiez votre catalogue". Sourcing mechanism not documented. [VERIFIED — homepage]
- **Integration method:** none public — no API, no developer or affiliate program mentioned; generic "partnership" contact. [VERIFIED — homepage]
- **Legal considerations:** Same as any aggregator: unknown data provenance (likely mix of submissions and aggregation); no license granted to reuse. [VERIFIED as "no license granted" — no terms text readable on homepage]
- **Suitability for Maqrivo:** Not suitable. Same blocker as Bonial without even the JSON-LD SEO layer.
- **Fallback role:** None beyond manual human consultation.

---

## 3. Other French catalogue apps (Catalogues & Promotions France, Promoaccro)

- **Purpose/App:** "Catalogues & Promotions France" (App Store) and Promoaccro (promoaccro.fr) aggregate current leaflets of French chains (Leclerc, Carrefour, Intermarché, Action…). [SECOND-HAND — https://apps.apple.com/fr/app/catalogues-promotions-france/id1524614605, https://promoaccro.fr/ via search]
- **Available data:** catalogue images/offers in-app. **Integration method:** none public. **Legal:** same aggregator posture. **Suitability:** not suitable. **Fallback role:** human consultation only.
- **Note on names from the brief:** "Prospecctor" (only UL Prospector exists — an ingredients-industry search engine, unrelated) and "Kiwii" (no French grocery-promo app of that name found) do not correspond to any real French promo aggregator. [VERIFIED as negative findings — searches 2026-09-04]

---

## 4. Pepesto (commercial grocery API)

- **Name:** Pepesto — "European Grocery API & AI Shopping Infrastructure"
- **Purpose:** Paid REST API normalising product catalogs, live prices, and **promotions** across European supermarkets; self-service API key, Stripe credit packs (Starter ≈ €29.90), no per-chain pricing. [VERIFIED — https://www.pepesto.com/ ; https://www.pepesto.com/pricing/]
- **Available data:** `/api/catalog` (one JSON schema per chain), daily refresh with promo prices normalized; explicitly NOT leaflet/catalogue-page data (no flyer images/pagination). [VERIFIED — homepage]
- **Coverage:** **No France.** Live: UK, NL, DE, BE, CH, IT, PL; "Carrefour ES — soon"; French chains absent. [VERIFIED — https://www.pepesto.com/]
- **Integration method:** API key via purchase, immediate; API terms at /api-terms/ (not read here). **Legal:** commercial licence, consumer-app use appears permitted. **Suitability for Maqrivo:** Not usable today — no French retailers. Worth re-checking quarterly (they add chains continuously). **Fallback role:** none for now; potential future paid source if France lands.

---

## 5. Parse.bot (API marketplace)

- **Purpose:** Marketplace of scraping-based APIs for retailers (e.g., "Albert CZ API — Recipes, Leaflets & Stores" with `get_leaflet_detail` for promo pricing). [SECOND-HAND — https://parse.bot/marketplace/e08617c1-37a1-4a18-a063-a11e3f4d47a7/albert-cz-api via search]
- **Integration method:** paid marketplace APIs. **Legal:** the marketplace operates scrapers itself; legality/ToS posture per retailer unknown. **Suitability:** no French supermarket endpoints surfaced. **Fallback role:** none.

---

## 6. supermarche.com public API

- **Name:** supermarche.com — free directory of French supermarkets
- **Purpose:** Open JSON directory of French supermarkets (brand, city, postcode, location), built from OpenStreetMap. **Not promos.** [VERIFIED — http://www.supermarche.com/api]
- **Available data:** `GET /supermarkets` (filters brand/postcode/city/department), `/supermarkets/nearby?lat&lon&radius_km`, `/brands`, `/departments`, `/stats`. No key; "no strict quota — please stay reasonable". Attribution required (ODbL, cite source if redistributed). [VERIFIED — same page]
- **Integration method:** plain HTTP GET, no registration. **Legal:** ODbL attribution/share-alike on redistribution. **Suitability for Maqrivo:** EXCELLENT for the store-discovery layer near Courbevoie (which Carrefour/Intermarché/Monoprix exist at a location) — but provides zero promotion data. **Fallback role:** store-directory complement to any promo source.

---

## 7. Cashback/coupon apps: Shopmium (Quotient Technology)

- **Purpose/App:** Receipt-scan cashback on specific branded products, works in all French stores; brand-funded. [VERIFIED — https://www.shopmium.com/fr ; SECOND-HAND — acquisition by Quotient Technology (ex-Coupons.com) Nov 2015: https://www.prnewswire.com/news-releases/quotient-acquires-shopmium-a-mobile-shopping-and-receipt-scanning-cash-back-application-platform-300170051.html]
- **Available data:** refund offers per product (not catalogues). **Integration method:** none public — no developer/affiliate API. **Legal:** consumer app; no third-party access. **Suitability:** not usable programmatically; UX-wise it's a different problem (post-purchase refunds) than Maqrivo's pre-purchase optimization. **Fallback role:** user can check Shopmium manually for brand refunds; no machine integration.

---

## 8. Retailers' own apps and portals

- **Carrefour:** the former open developer portal `developer.carrefour.com` no longer resolves (DNS failure, 2026-09-04) — no public French API; a separate Carrefour Italia developer portal exists (Italy only). [VERIFIED — DNS check; https://developers-test.carrefour.it/]
- **Intermarché, Auchan, Leclerc, Monoprix, Super U:** no public catalogue/promo APIs found; promotions live in their apps/sites as leaflet viewers. [VERIFIED as negative finding — searches 2026-09-04]
- **Suitability/Fallback role:** each retailer's own website/leaflets are the authoritative source a user can consult manually; scraping them is out of scope of this doc (separate research), but each has its own CGU.

---

## 9. Open Prices (Open Food Facts) — the genuinely open option

- **Name:** Open Prices — https://prices.openfoodfacts.org (code: https://github.com/openfoodfacts/open-prices)
- **Purpose:** Crowdsourced open database of product prices (incl. promo prices) with proofs (receipts/shelf photos). [VERIFIED — repo README]
- **Available data:** API `GET /api/v1/prices` (readable anonymously — verified) with per-record fields: `price`, **`price_is_discounted`**, **`discount_type`**, **`price_without_discount`**, `price_per`, `date`, `location` (OSM id/type), `product_code`, `currency`, `tags`. [VERIFIED — live API sample + https://prices.openfoodfacts.org/api/docs]
- **Integration method:** REST API; reads need no auth; writes need an Open Food Facts account + Bearer token via a dedicated session endpoint (for apps contributing prices). [VERIFIED — https://raw.githubusercontent.com/openfoodfacts/open-prices/main/API.md]
- **Legal:** data under **ODbL** (attribution, share-alike, contribute back). Code AGPL-3.0. [VERIFIED — API.md and repo]
- **Suitability for Maqrivo:** the only fully legal machine-readable promo-price source covering French stores — but coverage is crowdsourced and sparse; treat as opportunistic enrichment ("last seen price incl. discount at OSM location X"), not as a complete promo feed.
- **Fallback role:** PRIMARY legitimate fallback: (a) consume prices near Courbevoie, (b) optionally let Maqrivo contribute prices back (ODbL synergy).

---

## 10. Open standards for promotions

- **schema.org:** no dedicated "Promotion" type. Relevant vocabulary: `Offer`/`AggregateOffer` (price, priceSpecification, priceValidUntil), `SaleEvent` (start/end dates), `OfferCatalog`. Notably, **Bonial itself publishes exactly this markup** (see §1) — so any retailer or aggregator following the same pattern is machine-readable via JSON-LD. [VERIFIED — https://schema.org/SaleEvent, https://schema.org/Offer, https://schema.org/offers; Bonial JSON-LD verified by curl]
- **GS1:** GDSN and GS1 Digital Link standardise product data between trading partners (B2B); no consumer-facing leaflet/promo feed standard adopted by French grocery. [SECOND-HAND — https://www.gs1.org/standards/gdsn, https://www.gs1us.org/industries-and-insights/gs1-digital-link/for-retailers]
- **IPTC:** nothing applicable to retail promotions (IPTC standards target news metadata). [VERIFIED as negative finding]
- **RSS/JSON catalogue feeds from retailers:** none found for French grocery catalogues. [VERIFIED as negative finding — searches 2026-09-04]

---

## 11. Legal summary (scraping aggregators in France)

1. **Contract (CGU):** bonial.fr CGU restrict use to personal, non-professional purposes, ban commercial use outright, ban reverse-engineering, and route commercial reuse to "Partenariats Editeurs". A self-hosted personal app is arguably inside "personal use" only if it fetches nothing at scale and republishes nothing. [VERIFIED — https://www.bonial.fr/CGU]
2. **Robots.txt:** bonial.fr excludes all data endpoints and leaflet viewers; even the polite-crawler route to content is closed; crawl-delay 2 applies to the rest. [VERIFIED — https://www.bonial.fr/robots.txt]
3. **IP/database law:** extraction of a substantial part of a database can infringe the sui-generis right (CPI L341-1); the private-copy exception (CPI L122-5) is narrow and does not reliably cover building an app's data layer. [SECOND-HAND — https://www.app.asso.fr/preuve-digitale/web-scraping-legal.html]
4. **Criminal exposure:** art. 323-3 Code pénal (fraudulent extraction/introduction of data in an information system) applies to circumvention (e.g., hitting disallowed endpoints, bypassing rate limits). [SECOND-HAND — https://aumans-avocats.com/scraping-donnees-personnelles/]
5. **GDPR/CNIL:** scraping is lawful only with a legal basis and safeguards; not relevant to catalogue data (non-personal), but relevant if any user profiling is aggregated. [SECOND-HAND — https://www.cnil.fr/fr/focus-interet-legitime-collecte-par-moissonnage]
6. **EU case law trend:** CGU-based scraping bans are enforceable (Ryanair v Booking.com line). [SECOND-HAND — https://datadome.co/fr/learning-center/cgu-protection-web-scraping/]

---

## 12. Verdict for Maqrivo (personal-use, self-hosted)

- **No aggregator offers an API open to individuals.** Bonial: no public API; commercial reuse only via negotiated "Partenariats Editeurs"; viewers/endpoints robots-blocked. Promocatalogues/others: nothing programmatic at all. Pepesto (paid, self-serve) is the only European promo API with clean terms — and it has no France coverage yet.
- **The ethical, low-risk stack for the MVP:**
  1. **Store layer:** supermarche.com free API (ODbL, no key) or OpenStreetMap directly — which stores exist near Courbevoie/La Défense.
  2. **Promo layer (machine):** Open Prices (ODbL, no-auth reads, `price_is_discounted`/`discount_type`/`price_without_discount`) — sparse but legal, with an optional contribute-back loop that makes Maqrivo a good citizen.
  3. **Promo layer (human fallback):** the user consults bonial.fr / retailer apps for leaflet offers and enters or confirms them in Maqrivo (manual or semi-manual, e.g., photo/OCR of a leaflet page for personal use).
  4. **Do NOT scrape Bonial (or Promocatalogues) programmatically as an app feature.** Even at personal scale it contradicts their CGU's spirit (no reverse-engineering, viewers disallowed), and it cannot be the foundation of anything you later share. If ever consulted, do it as a human in a browser, or ask Bonial's Partenariats Editeurs contact if the project ever becomes shared/commercial: feedback@bonial.fr / corporate.bonial.com. [VERIFIED — contact points from https://www.bonial.fr/CGU and https://corporate.bonial.com/]
- **Re-check triggers:** Pepesto adding French chains; Open Prices coverage growth in 92; any Bonial publisher-partnership response.
