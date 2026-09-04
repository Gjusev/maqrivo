# Maqrivo Domain Model (v1 — pending plan approval)

PostgreSQL schema design. Conventions: snake_case tables, UUID primary keys (`gen_random_uuid()`), `created_at`/`updated_at` timestamptz everywhere, all money as **integer euro cents** (never floats), all quantities as `numeric`, all timestamps stored **UTC**. JSONB is used only where structure is genuinely source-specific or flexible (raw payloads, reason parameters, opening hours) — never for core domain facts.

Guiding rules:

- **Observations are append-only.** Prices are never overwritten; "current price" is a query (latest per product+store under a freshness policy), not a column.
- **Origin ≠ confidence.** A custom store can carry excellent price evidence; a discovered store can be stale. They are orthogonal.
- **Ownership is explicit.** Rows with `owner_user_id NULL` are global/shared (imported, seeded, discovered); rows with an owner are private to that user and vanish with the account.
- **Every external fact links to evidence.** Prices and promotions carry `source` + `evidence_id` + timestamps.

## Identity & configuration

### users / auth
Better Auth tables (`user`, `session`, `account`, `verification`) plus:

- **users_profile** (1:1 with auth user): `locale` ('en'|'fr'), `display_name`, `home_lat`, `home_lng`, `location_label`, `location_granularity_m` (snap radius, default 1500 — the server snaps coordinates to this grid before any external geo call), `currency` ('EUR').

### nutrition_profiles (per user, editable history kept as rows, latest wins)
`daily_kcal`, `protein_g`, `carbohydrate_g`, `fat_g`, `fiber_g` (all `int`, manual — never AI-computed), `meals_per_day`, `weekly_budget_cents` (nullable), `dietary` columns: `halal_required bool`, `allow_unknown_halal bool default false`, `vegetarian bool`, `vegan bool`, allergen/exclusion lists as text[].

### user_preferences (per user)
`search_radius_m` (default 2000), `max_stores_in_plan int default 3`, `travel_sensitivity` ('low'|'medium'|'high'), `default_objective` (enum, default 'BALANCED'), `max_cooking_minutes`, `max_distinct_recipes`, `repetition_tolerance`, `preferred_cuisines text[]`, `preferred/`avoided concept & store links via join tables (`user_store_prefs(user_id, store_id, enabled, favorite, avoided, notes)`).

Enabled-store rule (two-tier model): only `user_store_prefs.enabled = true` stores receive ingestion jobs and enter optimization.

## Retail world

### retailers
`slug`, `name`, `kind` ('chain'|'independent'), `adapter` (nullable — capability detection: absent adapter ⇒ discovery-only). Seeded: carrefour, intermarche, lidl, leclerc, monoprix, franprix, g20, independent.

### stores
`retailer_id` (nullable for independents), `name`, `format` ('supermarket'|'city'|'express'|'drive'|'butcher'|'bakery'|'market'|'specialty'|...), `address`, `lat`, `lng`, `opening_hours` (JSONB, OSM-style), `origin` ('osm'|'retailer'|'openprices'|'supermarche'|'user'), `owner_user_id` (nullable; set for private custom stores), `source` (human label), `external_ids JSONB` (osm ids, retailer store codes, Open Prices location id), `tags text[]` ('halal','butcher','bakery','vegetables','organic','bulk','cheap'), `last_verified_at`.

Distance is computed (haversine, cached in `user_store_prefs.distance_m` on refresh), never stored as truth on the store.

## Food & products

### food_concepts
`slug`, `name_en`, `name_fr`, `category`, `shelf_life_class` ('storable'|'semi'|'fresh' — drives residual-value rates), `default_unit`, reference nutrition per 100 g/ml as nullable columns (`energy_kcal, protein_g, carbohydrate_g, fat_g, saturated_fat_g, fiber_g, sugars_g, salt_g`), `owner_user_id` (null = seeded/global). Seeded catalog at startup (~120 curated concepts, both locales); users extend freely.

### products
`owner_user_id` (null = global), `name` (+ optional `name_fr` for user-entered secondary locale), `brand`, `barcode` (EAN-13, nullable, indexed; uniqueness enforced per scope to allow a global row and a user's private variant), `category`, `food_concept_id` (nullable link used by the optimizer), `purchasing_mode` ('PACKAGED'|'WEIGHT'|'UNIT'), `package_quantity numeric` + `package_unit` ('g'|'kg'|'ml'|'l'|'unit'), `serving_size`, `image_key`, `source` ('off'|'user'|'retailer'|'seed'), `external_ids JSONB` (`off_id`, retailer ids), `dietary`: `halal_state` ('CONFIRMED'|'CLAIMED'|'UNKNOWN'|'NOT_HALAL') + `halal_evidence_id`, `vegetarian bool?`, `vegan bool?`, `organic bool?`, `ingredients text`, `allergens text[]`.

Imported Open Food Facts rows are global (owner NULL); a user edit on a global row creates a user-owned overlay row linked via `forked_from_product_id` rather than mutating shared data.

### product_nutrition (1:1)
`product_id`, basis-normalized per 100 g/ml columns (same set as concepts), `basis` ('100g'|'100ml'), `source` ('off'|'user'|'label'), `source_url`, `verified bool`.

### product_store_availability
`product_id`, `store_id`, `available bool`, `source`, `last_seen_at`. Sparse — absence of a row means unknown, not unavailable.

## Prices

### price_observations (append-only)
`product_id`, `store_id`, `amount_cents int`, `currency`, `price_basis` ('unit'|'per_kg'|'per_100g'|'per_l'), `observed_at timestamptz`, `source` ('user'|'openprices'|'retailer'|'catalogue'|'receipt'|'manual'), `openprices_id` (nullable), `discounted bool`, `regular_amount_cents` (nullable — recorded when the shelf shows a crossed-out price), `evidence_id` (nullable), `notes`.

Freshness is derived at read time per source policy (user 14 d, openprices 30 d, retailer 7 d, catalogue = validity window), never stored as truth.

## Promotions & catalogues

### catalogues
`retailer_id`, `scope` ('national'|'region'|'store'), `store_id` (nullable), `region_key`, `external_id`, `valid_from date`, `valid_until date`, `source_url`, `evidence_id`.

### catalogue_pages
`catalogue_id`, `page_number`, `image_key` or `source_url`, `content_hash` (skip reprocessing identical pages), `processed_at`.

### promotions
`retailer_id`, `catalogue_id` (nullable), `store_id` (nullable), `region_key`, `description_raw` (verbatim extracted text), `brand`, `barcode`, `package_quantity/unit`, `regular_price_cents` (nullable), `promo_price_cents` (nullable), `price_per_kg_cents` (nullable), `mechanism` enum ('PROMO_PRICE','PERCENTAGE_OFF','MULTIBUY','BUY_X_GET_Y','SECOND_UNIT_DISCOUNT','BUNDLE','LOYALTY_PRICE','LOYALTY_CREDIT','CASHBACK','COUPON','CATEGORY_PROMO'), typed rule columns: `min_qty int`, `pay_qty int`, `get_qty int`, `discount_pct int`, `loyalty_required bool`, `conditions_raw text`, `valid_from date`, `valid_until date`, `source` ('catalogue'|'user'|'retailer'|'openprices'), `evidence_id`, `catalogue_page_id`, `retrieved_at`, `confidence` ('HIGH'|'MEDIUM'|'LOW'), `verification` ('OFFICIAL','EXTRACTED','USER_OBSERVED','NEEDS_VERIFICATION','STALE','EXPIRED').

Expiry is a daily job flipping `verification` to 'EXPIRED' when `valid_until < today`; the row is never deleted.

### promotion_product_matches
`promotion_id`, `product_id`, `state` ('EXACT'|'PROBABLE'|'AMBIGUOUS'|'UNRESOLVED'), `matched_by` ('barcode'|'retailer_id'|'brand'|'name'|'packaging'|'ai'), `score numeric`, `decided_by` ('rule'|'ai'|'user'), `decided_at`. UNRESOLVED promotions stay visible but never enter optimization as product-bound deals.

## Evidence

### source_evidence
`kind` ('retailer_page'|'catalogue'|'catalogue_page'|'openprices_proof'|'receipt_photo'|'product_photo'|'manual_observation'|'api_payload'), `retailer_id?`, `store_id?`, `catalogue_id?`, `page int?`, `url`, `storage_key` (local volume for uploads), `raw_excerpt text`, `content_hash`, `retrieved_at`, `owner_user_id` (uploads are private).

## Recipes & pantry

### recipes
`owner_user_id` (null = seeded dev/global), `name_fr`, `name_en` (one required), `servings int`, `prep_minutes`, `cook_minutes`, `meal_types text[]` ('breakfast','lunch','dinner','snack'), `tags text[]`, `instructions jsonb` (ordered step strings — genuinely flexible), `image_key`, `source` ('user'|'ai'|'import'|'seed'), `ai_request jsonb` (the constraint that generated it, for provenance).

Nutrition totals are **never stored as asserted facts on recipes** — always computed from ingredients at read/solve time (cached view columns allowed, recomputed on ingredient change).

### recipe_ingredients
`recipe_id`, `food_concept_id`, `quantity numeric`, `unit` ('g'|'kg'|'ml'|'l'|'unit'|'pack'), `is_optional bool`, `note`.

### pantry_items
`user_id`, `product_id` (nullable) or `food_concept_id` (one set), `quantity numeric`, `unit`, `purchased_at date`, `expires_on date?`, `opened_on date?`, `status` ('active'|'used_up'|'discarded'|'consumed_by_plan')`, `notes`.

## Planning & shopping (per user)

### meal_plans
`user_id`, `week_start date` (always a Monday), `objective`, `status` ('draft'|'active'|'archived')`, `created_at`.

### meal_slots
`meal_plan_id`, `date`, `meal_type`, `recipe_id` (nullable — empty slot), `servings int`, `locked bool`, `lock_reason text?`.

### shopping_plans
`user_id`, `meal_plan_id`, `objective`, `total_cents`, `currency`, `status` ('active'|'completed'|'archived')`, `summary jsonb` (deterministic totals: kcal/protein per day, per-store costs, waste estimate — cached optimizer output).

### shopping_plan_stores
`shopping_plan_id`, `store_id`, `sequence_index int` (geographic ordering), `estimated_travel_minutes int?`.

### shopping_items
`shopping_plan_id`, `store_id`, `product_id`, `required_quantity numeric` + `required_unit`, `purchase_quantity numeric` / `package_count int`, `price_basis` + `unit_price_cents`, `effective_cost_cents` (post-promotion, post-residual-credit), `applied_promotion_id?`, `reasons jsonb` (deterministic reason codes + parameters emitted by the optimizer — phrased for display, never invented), `price_freshness` ('fresh'|'stale'|'unknown' at generation time), `status` ('pending'|'purchased'|'unavailable'|'skipped')`.

## Operations

### ingestion_runs
`source`, `adapter`, `kind` ('store_refresh'|'catalogue_discovery'|'catalogue_ingestion'|'price_refresh'|'promotion_expiry'|'product_resolution'), `started_at`, `finished_at`, `status` ('running'|'succeeded'|'failed'|'partial')`, `stats jsonb` (counts per entity), `warnings jsonb`, `error text`. Feeds the internal admin/debug view.

### ai_extractions
`kind` ('catalogue_page'|'product_photo'|'recipe_candidate'|'match_assist'), `input_evidence_id?`, `model`, `prompt_version`, `output jsonb`, `validation_status` ('valid'|'repaired'|'rejected')`, `created_at`, `user_id`.

## Key invariants (enforced by constraints/tests)

1. `price_observations` rows are immutable (no UPDATE grants in app code; append + select only).
2. A promotion with `verification = 'EXPIRED'` can never be applied by the optimizer.
3. `halal_state = 'UNKNOWN'` products are excluded whenever `halal_required` and `allow_unknown_halal = false` — in the solver candidate set, not filtered post-hoc.
4. Money columns are `int` cents; every display conversion goes through Intl formatting.
5. Recipe nutrition is a computed value; a stale cache recomputes on ingredient change (version column).
6. Locale (`users_profile.locale`) appears in zero domain tables — switching language can only change presentation.
7. Optimizer inputs are snapshotted into `shopping_plans.summary` so explanations survive later price changes.
