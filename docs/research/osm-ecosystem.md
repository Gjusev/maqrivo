# OSM Ecosystem Research for Maqrivo

**Date:** 2026-09-04
**Scope:** Store discovery (Overpass API), geocoding (Nominatim/Photon), map rendering (MapLibre GL JS / Leaflet / tile providers), and distance computation, for a self-hosted personal nutrition + grocery PWA whose users configure an approximate home location (reference area: Courbevoie / La Défense, France).
**Privacy driver:** precise home coordinates must not be leaked to third parties more than necessary.

Sources are official documentation unless noted. Anything that could not be verified against a current official source is flagged **[unverified]**.

---

## 1. Overpass API

### What it is
A read-only API that queries a (near-)live copy of the OpenStreetMap database with a declarative query language (Overpass QL). It is the standard way to ask "give me all supermarkets within N meters of lat/lng" without downloading OSM extracts. The reference instance is run by FOSSGIS at `https://overpass-api.de/api/interpreter` ([OSM Wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)).

### Current endpoints / instances (as of 2026-09, per the wiki instance table)

| Instance | Endpoint | Notes |
|---|---|---|
| **Main (FOSSGIS)** | `https://overpass-api.de/api/interpreter` | v0.7.62.11, attic data, 2 servers; "nowadays this server is overloaded" ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)) |
| **Private.coffee** (ex kumi.systems) | `https://overpass.private.coffee/api/interpreter` | v0.7.62.11, attic, 4 servers, "no rate limit in place", asks to be notified for large-scale use ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)) |
| **VK Maps** | `https://maps.mail.ru/osm/tools/overpass/api/interpreter` | Russia-operated, "currently no requests limitations" ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)) |
| Geofabrik / Tracestrack / Overspan / FairwayMapper | API-key / paid | Commercial-grade alternatives ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API), [Geofabrik](https://www.geofabrik.de/data/overpass-api.html)) |
| Regional (Swiss, Britain & Ireland, Virginia, Ethiopia) | see wiki | None covers France ([wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)) |

**Is there a well-maintained French instance? No.** A French instance `overpass.openstreetmap.fr` existed but is "known to be down since about the large relation incident" (~late 2021) and does not appear in the current instance list — the only regional instances today are Switzerland, Britain & Ireland, Virginia, and Ethiopia ([Overpass status page](https://wiki.openstreetmap.org/wiki/Overpass_API/status), [instance list](https://wiki.openstreetmap.org/wiki/Overpass_API)). Historical praise of "the French instance" on the status page dates from 2016 and is stale.

### Usage policy (main instance, per [OSM Wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API))
- "You can assume that you don't disturb other users when you do less than 10,000 queries per day" plus under 1 GB downloaded daily (one-off use).
- Recurring/automated setups should divide by 100: roughly "less than 100 queries fetching less than 10 MB of data per day".
- Apps: **all end-user requests count toward the app's total**; a unique `User-Agent` or `Referer` identifying the app is required.
- "No parallel running of multiple scripts." "Cache and rate-limit calls."
- "If you receive an HTTP error code such as 429 or 406, pause for 30 seconds before making a new request."
- "Commercial use should use self-hosted or paid Overpass servers."
- The instance list warns generally: "Free public servers are designed for small projects and can often become overloaded."

Note: the often-cited "2 concurrent slots per IP" implementation detail could **not** be verified in current official documentation **[unverified]**; the FAQ and language guide do not mention it ([FAQ](https://wiki.openstreetmap.org/wiki/Overpass_API/FAQ), [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)). Treat the daily-quota policy above as binding instead.

### Integration method — querying shops around a lat/lng
The `around` filter selects elements within a radius in meters of a coordinate: syntax `node(around:radius,latitude,longitude)`, e.g. `node(around:100.0,50.7,7.1);` ([Overpass QL — around](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)). The docs warn: "When possible, consider using the *bounding box* query filter instead of the *around* query filter... The bounding box query filter performs faster." (For small radii `around` is fine and much simpler.)

Brand tagging scheme: a chain store is `shop=supermarket` + `brand=<Chain>` + `brand:wikidata=<Q-ID>` (+ optional `name`); `brand:wikidata` is "the wikidata ID of the brand" ([Key:brand](https://wiki.openstreetmap.org/wiki/Key:brand)). Editor suggestions come from the Name Suggestion Index, "a collection of tagging presets that represent: brick-and-mortar brands..." ([Key:brand](https://wiki.openstreetmap.org/wiki/Key:brand)).

Typical query for the Courbevoie/La Défense area (all major French chains + bakeries + butchers, radius 1500 m; note `nwr` = node/way/relation union, and `out center` gives a centroid for ways):

```
[out:json][timeout:25];
(
  nwr[shop~"supermarket|convenience"](around:1500,48.8950,2.2440);
  nwr[shop=bakery](around:1500,48.8950,2.2440);
  nwr[shop=butcher](around:1500,48.8950,2.2440);
  nwr[shop=greengrocer](around:1500,48.8950,2.2440);
);
out center tags;
```

Brand/wikidata filtering variants:
- By brand wikidata: `nwr[brand:wikidata=Q217599](around:1500,48.8950,2.2440);` — wikidata key equality is indexed and fast.
- By brand regex: `nwr[brand~"Carrefour|Intermarché|E.Leclerc|Monoprix|Franprix|Lidl|G20"](around:1500,...);` — catches sub-brands (e.g. `Carrefour City`) because regex matches substrings unanchored.

Verified brand:wikidata Q-IDs (via [Wikidata API](https://www.wikidata.org/w/api.php) searches, 2026-09-04):

| Chain | Q-ID | Description returned by API |
|---|---|---|
| Carrefour | Q217599 | "French hypermarket brand of the Carrefour Group" |
| Intermarché | Q3153200 | "French multinational supermarket chain" |
| E.Leclerc | Q1273376 | "supermarket chain based in France" |
| Monoprix | Q3321241 | "French retail chain" |
| Lidl | Q151954 | "German global discount supermarket chain" |
| Franprix | Q2420096 | "convenience store brand of the Casino Group" |
| G20 | **none found** | Wikidata search for "G20 supermarché" returned no entity — query G20 by `name`/`brand` regex instead **[unverified as absent — search simply found nothing]** |

Brand value fragmentation is real: `brand=Carrefour` (3,180 uses), `Carrefour Express` (3,046), `Carrefour Market` (2,424), `Carrefour City` (1,132), `Carrefour Contact` (748) etc. — an *unanchored regex* on `brand` is therefore the most robust match for French chains ([taginfo brand values](https://taginfo.openstreetmap.org/api/4/key/values?key=brand&query=Carrefour)). Independent halal butchers have no brand tag at all — match them via `shop=butcher` + `cuisine`/`name` keywords, accepting that OSM coverage of "halal" attributes is community-dependent **[coverage claim not officially documented]**.

### On-demand vs caching
**Not suitable for unmediated on-demand client queries.** The public instance "is overloaded" and the policy explicitly holds apps accountable for all end-user traffic, demands caching, and rate limiting ([policy](https://wiki.openstreetmap.org/wiki/Overpass_API)). Correct pattern for Maqrivo:
1. Client calls Maqrivo's own backend (home coords never leave the backend see Privacy, below).
2. Backend snaps the query center to a grid (e.g. ~1–2 km cells), checks a local cache/DB keyed by (grid cell, query), and only calls Overpass on miss.
3. Cache aggressively (shops change slowly; weekly refresh is plenty) and store normalized results (name, brand, wikidata, lat/lon, opening_hours) in Maqrivo's own DB so subsequent map views never touch Overpass.
4. Fail over between `overpass-api.de` and `overpass.private.coffee` on 429/5xx, with ≥30 s backoff ([policy](https://wiki.openstreetmap.org/wiki/Overpass_API)).

### License
Overpass API software: AGPLv3, source at github.com/drolbr/Overpass-API ([OSM Wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)). **Data served is OSM data under ODbL 1.0** — attribution "© OpenStreetMap contributors" required; if Maqrivo mixes OSM data into its own DB, ODbL share-alike applies to the derived store database (see [ODbL summary](https://opendatacommons.org/licenses/odbl/summary/)).

### Recommendation for Maqrivo
Use **Overpass via a server-side proxy with grid-snapped, aggressively cached queries** (TTL ≈ 1–4 weeks per grid cell), primary `overpass-api.de`, fallback `overpass.private.coffee`. Trigger discovery once when the user sets/moves their home area, not on every map render. Keep a per-app User-Agent (`Maqrivo/1.0 (contact)`).

### Fallback
- Bulk alternative: download the Geofabrik France extract (`france-latest.osm.pbf`, 4.7 GB, refreshed daily, "contains all OSM data up to" within hours) and pre-filter shops with Osmium — suggested by the wiki itself for heavier needs ([Geofabrik France](https://download.geofabrik.de/europe/france.html), [wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)). One extract can seed the entire Île-de-France store universe offline.
- Custom stores entered by the user are native Maqrivo data and never require Overpass.

---

## 2. Geocoding

### Nominatim (public instance)

**What it is / integration.** Search (`/search`) with free-form `q` or structured fields (`street`, `city`, `postalcode`, `country`), hard country filter `countrycodes=fr` ("a hard filter and as such should be preferred"), `limit` (max 40), `format=jsonv2`, `addressdetails=1`; reverse (`/reverse`) takes `lat`/`lon` (WGS84) and a `zoom` parameter for "Level of detail required for the address" — zoom 18 = building, 17 = major+minor streets, 14 = neighbourhood, 10 = city ([Search API](https://nominatim.org/release-docs/latest/api/Search/), [Reverse API](https://nominatim.org/release-docs/latest/api/Reverse/)). For "store at these coordinates", `format=jsonv2` returns `category`, `type`, `display_name` and an `address` breakdown, so the store's own OSM object is returned when it is the nearest suitable object ([Reverse API](https://nominatim.org/release-docs/latest/api/Reverse/)).

**Rate limits / policy (public server only).** "An absolute maximum of 1 request per second"; long-running bulk scripts "4 requests per minute"; limits apply to the *sum* of all the app's users; a valid identifying `Referer` or `User-Agent` is mandatory; results "must be cached on your side". **Autocomplete is explicitly forbidden**: it is "Unacceptable Use" and "you must not implement such a service on the client side using the API". Apps must set up a proxy, and must be able to switch away from the service without a software update. Systematic reverse geocoding (grid queries) is banned ([Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)).

**License.** Software GPLv2; data ODbL, attribution required ([Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)).

**Self-hosting.** `pip install nominatim-db nominatim-api`, PostgreSQL 12+/PostGIS 3.0+ (13+/3.2+ strongly recommended). "A minimum of 2GB of RAM is required"; a full planet wants "128GB of RAM or more" and "at least 1TB" disk, import ~2.5 days on NVMe — but a France extract import is a far smaller job the same docs support ([Installation](https://nominatim.org/release-docs/latest/admin/Installation/)). **[Exact RAM/disk figures for a France-only import are not published; extrapolate from the 4.7 GB PBF size.]**

### Photon (komoot)

**What it is / integration.** Open-source geocoder "built for OpenStreetMap data", based on OpenSearch, with a free demo server at `https://photon.komoot.io`, no API key ([GitHub](https://github.com/komoot/photon)). Endpoints: `/api` (forward), `/structured`, `/reverse`, plus parameters `q`, `lat`/`lon` (search bias), `limit`, `lang`, `bbox` (minLon,minLat,maxLon,maxLat), `countrycode` (repeatable), `layer`, `location_bias_scale`; reverse takes `lat`, `lon`, `radius` (km), `limit`. Results are GeoJSON (GeocodeJson) with an `extra` object of OSM tags ([API docs](https://github.com/komoot/photon/blob/master/docs/api-v1.md)). It is built for "search-as-you-type", typo-tolerant, location-biased, multilingual ([GitHub](https://github.com/komoot/photon)) — i.e. the autocomplete-friendly option Nominatim forbids.

**Rate limits / policy.** "You are welcome to use the API for your project as long as the number of requests stay in a reasonable limit"; "Extensive usage will be throttled or completely banned"; no availability guarantee ([GitHub](https://github.com/komoot/photon)). No numeric QPS published **[unverified beyond this]**.

**License.** Code "licensed under Apache License, Version 2.0" ([GitHub](https://github.com/komoot/photon)). The README does not state a data license; the database is an OSM extract and is therefore ODbL **[data-license sentence not present in README — inferred]**.

**Self-hosting.** Release binary + prebuilt planet dump: `wget -O - https://download1.graphhopper.com/public/photon-db-planet-1.0-latest.tar.bz2 | bzip2 -cd | tar x`, then `java -jar photon-*.jar serve` on `localhost:2322`; Java 21+, ~95 GB disk for planet, 64 GB+ RAM recommended ([GitHub](https://github.com/komoot/photon)). Smaller regional dumps are linked from the same repo. **[Whether an official France-only dump exists was not verified.]**

### France address-search quality
No official, current benchmark of Nominatim/Photon quality for French addresses was found **[unverified]**. Both consume the same OSM data for France, whose coverage of addresses and POIs in Île-de-France is strong by community reputation only.

### Recommendation for Maqrivo
- **Autocomplete (address picker):** proxy Photon (`photon.komoot.io`) through the Maqrivo backend with `lat`/`lon` bias around the user's coarse area, `lang=fr` (default `en`), `bbox`/`countrycode=FR` filters, debounce ≥300 ms, cache results. Photon is explicitly designed for this; Nominatim forbids it. If the app grows or komoot throttles: self-host Photon with a France dump (single Java service, modest footprint).
- **Reverse geocoding ("store at these coordinates"):** Nominatim `/reverse` with `zoom=18&format=jsonv2&addressdetails=1`, cached per OSM object — rare, user-triggered, well within 1 req/s.
- **Never** call either API directly from the PWA client: it leaks the user's IP/geographic intent and breaks the "app must proxy + cache" policy requirements ([Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)).

### Fallback
Reverse: self-hosted Photon `/reverse` (same instance, unlimited). Autocomplete: self-hosted Nominatim is *not* suitable for autocomplete-style load either without capacity; the pragmatic escalation is a self-hosted Photon with a France extract, or a commercial geocoder.

---

## 3. Map rendering

### Renderer: MapLibre GL JS vs Leaflet

| | MapLibre GL JS | Leaflet |
|---|---|---|
| Model | "TypeScript library that uses WebGL to render interactive maps from vector tiles in a browser"; style-spec driven; markers, popups, globe projection, 3D terrain ([docs](https://maplibre.org/maplibre-gl-js/docs/)) | "Open-source JavaScript library for mobile-friendly interactive maps", "extremely lightweight" (~42 KB), raster `L.tileLayer` core, no built-in vector-tile rendering (plugin needed) ([leafletjs.com](https://leafletjs.com/)) |
| Version / maturity | v6.x (docs quickstart shows `maplibre-gl@^6.7.0`; "v6 ships as ES modules only"); community fork of mapbox-gl-js (Dec 2020 fork event); sponsors include Microsoft, AWS, komoot, MapTiler ([docs](https://maplibre.org/maplibre-gl-js/docs/), [GitHub](https://github.com/maplibre/maplibre-gl-js)) | Stable 1.9.x line since 2010; "Leaflet 2.0.0-alpha.1" released 2025-08-16 (pre-release) ([leafletjs.com](https://leafletjs.com/)) |
| License | LICENSE.txt is BSD-3-Clause-structured ("Copyright (c) 2023, MapLibre contributors"; the file explicitly states v1.13 of mapbox-gl-js and earlier were "licensed under a BSD-3-Clause license") and the GitHub badge reads BSD-3-Clause ([LICENSE.txt](https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/LICENSE.txt), [GitHub](https://github.com/maplibre/maplibre-gl-js)). *Some third-party comparisons still say BSD-2-Clause — treat BSD-3-Clause per the repo as authoritative.* | "BSD 2-Clause License", "Copyright (c) 2010-2026, Volodymyr Agafonkin" ([LICENSE](https://raw.githubusercontent.com/Leaflet/Leaflet/main/LICENSE)) |

**Pragmatic choice: MapLibre GL JS.** Vector tiles give smooth zoom, styled POI layers, small payloads, and one style JSON controls look; it is the maintained OSS successor lineage with heavy sponsorship. Leaflet remains fine for a raster-only, minimal map, but its stable line cannot render MVT natively ([leafletjs.com](https://leafletjs.com/)). Note MapLibre v6 requires CSP directives `"worker-src 'self';"` and `"img-src data: blob: 'self';"` and its CSS is mandatory ([docs](https://maplibre.org/maplibre-gl-js/docs/)).

### Tile providers

**a) `tile.openstreetmap.org` (OSMF raster):** not for app use beyond light viewing. "Our tile servers are not" free-for-all; bulk downloading (any pre-emptive fetching beyond the user's viewport) and offline use are prohibited; distinct User-Agent/Referer required, generic defaults "will be blocked"; attribution must be visible; heavy users are directed to alternatives or self-hosting ([Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)).

**b) OpenFreeMap (free vector):** free vector tiles + styles (Positron, Bright, Liberty, Dark, Fiord, 3D), "no registration, no user database, no API keys, and no cookies", "no limits on the number of map views or requests", weekly full-planet Btrfs/MBTiles downloads for self-hosting; no SLA; attribution "OpenFreeMap / © OpenMapTiles / Data from OpenStreetMap" required ("You do not need to display the OpenFreeMap part, but it is nice if you do") ([openfreemap.org](https://openfreemap.org/)). Served as static files via nginx ("not a CDN, no cloud") **[availability depends on the project's dedicated servers; no SLA]**.

**c) Commercial:** MapTiler — API key, free plan with "5k/month" map sessions and "100k/month" API requests, "MapTiler logo on the map" required on free; service pauses when quota is hit ([pricing](https://www.maptiler.com/pricing/)). Stadia Maps — free tier "$0/month, 200,000credits/month... Commercial use not allowed", 1 credit per vector/raster tile, tiles "for use in MapLibre and other client-side vector renderers" ([pricing](https://stadiamaps.com/pricing/)).

### License
Renderers: BSD (above). OpenFreeMap project MIT; its map data is OSM (ODbL) via unmodified OpenMapTiles schema ([openfreemap.org](https://openfreemap.org/)).

### Recommendation for Maqrivo
**MapLibre GL JS + OpenFreeMap vector tiles (e.g. Liberty or Positron style).** Zero key management, unlimited views for a personal self-hosted PWA, attribution is one line; if OpenFreeMap degrades, switching to MapTiler (free tier, key) or self-hosting OpenFreeMap's weekly MBTiles with tileserver-gl is a style-URL change. Keep attribution visible in the map UI (ODbL/OSMF requirement).

### Fallback
1. MapTiler free tier (vector, MapLibre-native, API key) ([pricing](https://www.maptiler.com/pricing/)).
2. Self-host OpenFreeMap planet MBTiles (weekly downloads offered) ([openfreemap.org](https://openfreemap.org/)).
3. Last resort: Leaflet + raster tiles from a compliant provider (Stadia free tier is non-commercial-only) ([leafletjs.com](https://leafletjs.com/), [Stadia](https://stadiamaps.com/pricing/)).

### Privacy note (map display)
Tile requests are issued by the client browser, so the tile provider sees the user's IP and the tiles fetched — i.e. the *viewed area*, which around a home reveals the neighborhood but not exact coordinates. Mitigations consistent with "approximate home location": zoom out slightly, or proxy tiles through Maqrivo's backend with caching (allowed: OpenFreeMap has no request limits; the OSMF policy's local-caching rule similarly permits viewport caching — [tile policy](https://operations.osmfoundation.org/policies/tiles/)). **[Privacy interpretation is ours, not a quoted policy.]**

---

## 4. Distance computation

### What it is
Haversine computes the great-circle distance between two WGS84 points: `a = sin²(Δφ/2) + cosφ1·cosφ2·sin²(Δλ/2); c = 2·atan2(√a, √(1−a)); d = R·c` with mean Earth radius `R = 6371e3` m ([Movable Type Scripts — "Calculate distance, bearing and more between two Latitude/Longitude points"](https://movable-type.co.uk/scripts/latlong.html)).

### Accuracy and pitfalls (per the same source)
- "Using a spherical model gives errors typically up to 0.3%" (up to ~0.55% crossing the equator) — for a 2 km grocery trip that is ≤ ~6 m, irrelevant for ranking stores.
- Haversine "remains particularly well-conditioned for numerical computation even at small distances" (unlike spherical law of cosines).
- Degrees vs radians: "mixing degrees & radians is often the easiest route to head-scratching bugs" — convert lat/lng to radians first. Watch argument order of `atan2` (and lat/lng vs lng/lat ordering between libraries).
- If sub-meter accuracy ever matters, use a geodesic (ellipsoidal) method — Vincenty "gives results accurate to within 1mm" ([same page](https://movable-type.co.uk/scripts/latlong.html)).
- Straight-line vs actual travel distance: haversine is "as-the-crow-flies"; it underestimates walking/driving distance in a city (typically 20–30% in street grids — **[rule of thumb, not from cited page]**). If real routing is ever needed, that is a routing engine (OSRM/Valhalla) concern, out of scope here.
- Ready-made implementation: Turf.js `distance` "calculates the distance between two coordinates in degrees, radians, miles, or kilometers", default kilometers, haversine-based ([turf docs](https://turfjs.org/docs/api/distance)).

### License
Movable Type Scripts' code is MIT ([page notice](https://movable-type.co.uk/scripts/latlong.html)); Turf is MIT ([turf docs](https://turfjs.org/docs/api/distance)). A 15-line own implementation has no license issue.

### Recommendation for Maqrivo
Haversine in ~10 lines of TypeScript (or `@turf/distance` if Turf is already a dependency), `R = 6371008.8` m, degrees→radians conversion centralized in one utility, all distances computed **server-side or client-side from cached store coordinates** — never via a third-party distance API (nothing to leak). Sort stores by haversine distance; optionally display a heuristic walking estimate (×1.25) clearly labelled as approximate.

### Fallback
If walkability/route reality becomes important: self-host OSRM on the Geofabrik France extract ([extract](https://download.geofabrik.de/europe/france.html)) — noted here as the standard OSS option; not evaluated in this research **[not verified]**.

---

## 5. Cross-cutting privacy design (Maqrivo-specific synthesis)

1. **Home coordinates stay in Maqrivo's backend/DB.** External calls (Overpass, Photon, Nominatim) are proxied server-side; the client never sends home lat/lng to third parties.
2. **Snap before querying:** round the discovery center to a 1–2 km grid; the third party receives the grid center, not the home. This also makes caching natural.
3. **Query once per area change**, not per render; serve stores from Maqrivo's own DB afterwards (ODbL note: store data derived from OSM keeps ODbL share-alike for that dataset).
4. **Map tiles** reveal only viewport areas to the tile provider; optionally proxy through the backend.
5. Identify all outbound requests with a stable `User-Agent: Maqrivo/1.0 (<contact>)` as required by Overpass, Nominatim, and OSMF tile policies.

---

## Source index

- Overpass API (instances, policy, quota): https://wiki.openstreetmap.org/wiki/Overpass_API
- Overpass status / French instance history: https://wiki.openstreetmap.org/wiki/Overpass_API/status
- Overpass QL (`around` filter): https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
- Overpass FAQ: https://wiki.openstreetmap.org/wiki/Overpass_API/FAQ
- brand tagging: https://wiki.openstreetmap.org/wiki/Key:brand
- taginfo brand values: https://taginfo.openstreetmap.org/api/4/key/values?key=brand&query=Carrefour
- Wikidata API entity searches: https://www.wikidata.org/w/api.php (Carrefour Q217599, Intermarché Q3153200, E.Leclerc Q1273376, Monoprix Q3321241, Lidl Q151954, Franprix Q2420096)
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
- Nominatim Search API: https://nominatim.org/release-docs/latest/api/Search/
- Nominatim Reverse API: https://nominatim.org/release-docs/latest/api/Reverse/
- Nominatim installation: https://nominatim.org/release-docs/latest/admin/Installation/
- Photon repo: https://github.com/komoot/photon
- Photon API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
- MapLibre GL JS docs: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre GL JS LICENSE: https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/LICENSE.txt
- MapLibre GitHub: https://github.com/maplibre/maplibre-gl-js
- Leaflet site: https://leafletjs.com/
- Leaflet LICENSE: https://raw.githubusercontent.com/Leaflet/Leaflet/main/LICENSE
- OpenFreeMap: https://openfreemap.org/
- MapTiler pricing: https://www.maptiler.com/pricing/
- Stadia Maps pricing: https://stadiamaps.com/pricing/
- OSMF tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- Haversine: https://movable-type.co.uk/scripts/latlong.html
- Turf distance: https://turfjs.org/docs/api/distance
- Geofabrik France extract: https://download.geofabrik.de/europe/france.html
