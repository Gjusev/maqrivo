CREATE TYPE "public"."ai_extraction_kind" AS ENUM('catalogue_page', 'product_photo', 'recipe_candidate', 'match_assist');--> statement-breakpoint
CREATE TYPE "public"."ai_validation_status" AS ENUM('valid', 'repaired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."decided_by" AS ENUM('rule', 'ai', 'user');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('retailer_page', 'catalogue', 'catalogue_page', 'openprices_proof', 'receipt_photo', 'product_photo', 'manual_observation', 'api_payload');--> statement-breakpoint
CREATE TYPE "public"."halal_state" AS ENUM('CONFIRMED', 'CLAIMED', 'UNKNOWN', 'NOT_HALAL');--> statement-breakpoint
CREATE TYPE "public"."ingestion_kind" AS ENUM('store_refresh', 'catalogue_discovery', 'catalogue_ingestion', 'price_refresh', 'promotion_expiry', 'product_resolution');--> statement-breakpoint
CREATE TYPE "public"."matched_by" AS ENUM('barcode', 'retailer_id', 'brand_name_packaging', 'none');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."nutrition_basis" AS ENUM('100g', '100ml');--> statement-breakpoint
CREATE TYPE "public"."objective_preset" AS ENUM('CHEAPEST', 'BALANCED', 'FEWEST_STORES', 'MINIMUM_TRAVEL', 'MAX_PROTEIN_PER_EURO', 'PROMOTION_FOCUSED', 'LOW_WASTE');--> statement-breakpoint
CREATE TYPE "public"."pantry_status" AS ENUM('active', 'used_up', 'discarded', 'consumed_by_plan');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('unit', 'per_kg', 'per_100g', 'per_l', 'per_100ml');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('user', 'openprices', 'retailer', 'catalogue', 'receipt', 'manual');--> statement-breakpoint
CREATE TYPE "public"."product_source" AS ENUM('off', 'user', 'retailer', 'seed');--> statement-breakpoint
CREATE TYPE "public"."promo_confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."promo_mechanism" AS ENUM('PROMO_PRICE', 'PERCENTAGE_OFF', 'MULTIBUY', 'BUY_X_GET_Y', 'SECOND_UNIT_DISCOUNT', 'LOYALTY_PRICE', 'LOYALTY_CREDIT', 'CASHBACK', 'COUPON', 'CATEGORY_PROMO');--> statement-breakpoint
CREATE TYPE "public"."promo_scope" AS ENUM('national', 'region', 'store');--> statement-breakpoint
CREATE TYPE "public"."promo_source" AS ENUM('catalogue', 'user', 'retailer', 'openprices');--> statement-breakpoint
CREATE TYPE "public"."promo_verification" AS ENUM('OFFICIAL', 'EXTRACTED', 'USER_OBSERVED', 'NEEDS_VERIFICATION', 'STALE', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."purchasing_mode" AS ENUM('PACKAGED', 'WEIGHT', 'UNIT');--> statement-breakpoint
CREATE TYPE "public"."recipe_source" AS ENUM('user', 'ai', 'import', 'seed');--> statement-breakpoint
CREATE TYPE "public"."resolution_state" AS ENUM('EXACT', 'PROBABLE', 'AMBIGUOUS', 'UNRESOLVED');--> statement-breakpoint
CREATE TYPE "public"."retailer_kind" AS ENUM('chain', 'independent');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'succeeded', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."shelf_life_class" AS ENUM('storable', 'semi', 'fresh');--> statement-breakpoint
CREATE TYPE "public"."shopping_item_status" AS ENUM('pending', 'purchased', 'unavailable', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."store_origin" AS ENUM('osm', 'retailer', 'openprices', 'supermarche', 'user');--> statement-breakpoint
CREATE TYPE "public"."travel_sensitivity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "nutrition_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"daily_kcal" integer,
	"protein_g" integer,
	"carbohydrate_g" integer,
	"fat_g" integer,
	"fiber_g" integer,
	"meals_per_day" integer DEFAULT 3 NOT NULL,
	"weekly_budget_cents" integer,
	"halal_required" boolean DEFAULT false NOT NULL,
	"allow_unknown_halal" boolean DEFAULT false NOT NULL,
	"vegetarian" boolean DEFAULT false NOT NULL,
	"vegan" boolean DEFAULT false NOT NULL,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"excluded_concepts" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"search_radius_m" integer DEFAULT 2000 NOT NULL,
	"max_stores_in_plan" integer DEFAULT 3 NOT NULL,
	"travel_sensitivity" "travel_sensitivity" DEFAULT 'medium' NOT NULL,
	"default_objective" "objective_preset" DEFAULT 'BALANCED' NOT NULL,
	"max_cooking_minutes" integer,
	"max_distinct_recipes" integer,
	"repetition_tolerance" integer DEFAULT 2 NOT NULL,
	"preferred_cuisines" text[] DEFAULT '{}' NOT NULL,
	"loyalty_retailers" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_store_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"store_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"avoided" boolean DEFAULT false NOT NULL,
	"distance_m" integer,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_store_unique" UNIQUE("user_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "users_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"display_name" text,
	"home_lat" double precision,
	"home_lng" double precision,
	"location_label" text,
	"location_granularity_m" integer DEFAULT 1500 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retailer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_fr" text,
	"kind" "retailer_kind" DEFAULT 'chain' NOT NULL,
	"adapter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retailer_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid,
	"name" text NOT NULL,
	"format" text,
	"address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"opening_hours" jsonb,
	"origin" "store_origin" NOT NULL,
	"owner_user_id" text,
	"source" text,
	"external_ids" jsonb,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"website" text,
	"phone" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_concept" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text NOT NULL,
	"category" text NOT NULL,
	"shelf_life_class" "shelf_life_class" DEFAULT 'semi' NOT NULL,
	"default_unit" text DEFAULT 'g' NOT NULL,
	"energy_kcal" integer,
	"protein_g" numeric(6, 2),
	"carbohydrate_g" numeric(6, 2),
	"fat_g" numeric(6, 2),
	"saturated_fat_g" numeric(6, 2),
	"fiber_g" numeric(6, 2),
	"sugars_g" numeric(6, 2),
	"salt_g" numeric(6, 3),
	"basis" "nutrition_basis" DEFAULT '100g' NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_concept_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"name_fr" text,
	"brand" text,
	"barcode" text,
	"category" text,
	"food_concept_id" uuid,
	"purchasing_mode" "purchasing_mode" DEFAULT 'PACKAGED' NOT NULL,
	"package_quantity" numeric(10, 3),
	"package_unit" text,
	"serving_size" text,
	"image_key" text,
	"source" "product_source" DEFAULT 'user' NOT NULL,
	"external_ids" jsonb,
	"forked_from_product_id" uuid,
	"halal_state" "halal_state" DEFAULT 'UNKNOWN' NOT NULL,
	"halal_evidence_id" uuid,
	"vegetarian" boolean,
	"vegan" boolean,
	"organic" boolean,
	"ingredients" text,
	"allergens" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_owner_barcode_unique" UNIQUE("owner_user_id","barcode")
);
--> statement-breakpoint
CREATE TABLE "product_nutrition" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"basis" "nutrition_basis" DEFAULT '100g' NOT NULL,
	"energy_kcal" integer,
	"protein_g" numeric(6, 2),
	"carbohydrate_g" numeric(6, 2),
	"fat_g" numeric(6, 2),
	"saturated_fat_g" numeric(6, 2),
	"fiber_g" numeric(6, 2),
	"sugars_g" numeric(6, 2),
	"salt_g" numeric(6, 3),
	"source" text DEFAULT 'user' NOT NULL,
	"source_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_store_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"source" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_store_availability_unique" UNIQUE("product_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "price_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"price_basis" "price_basis" DEFAULT 'unit' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "price_source" DEFAULT 'user' NOT NULL,
	"openprices_id" text,
	"discounted" boolean DEFAULT false NOT NULL,
	"regular_amount_cents" integer,
	"evidence_id" uuid,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"scope" "promo_scope" DEFAULT 'store' NOT NULL,
	"store_id" uuid,
	"region_key" text,
	"external_id" text,
	"title" text,
	"valid_from" date,
	"valid_until" date,
	"source_url" text,
	"evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogue_external_unique" UNIQUE("retailer_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "catalogue_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalogue_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"image_key" text,
	"source_url" text,
	"content_hash" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogue_page_unique" UNIQUE("catalogue_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retailer_id" uuid NOT NULL,
	"catalogue_id" uuid,
	"store_id" uuid,
	"region_key" text,
	"description_raw" text NOT NULL,
	"brand" text,
	"barcode" text,
	"package_quantity" numeric(10, 3),
	"package_unit" text,
	"regular_price_cents" integer,
	"promo_price_cents" integer,
	"price_per_kg_cents" integer,
	"mechanism" "promo_mechanism" NOT NULL,
	"min_qty" integer,
	"max_qty" integer,
	"pay_qty" integer,
	"get_qty" integer,
	"discount_pct" integer,
	"loyalty_required" boolean DEFAULT false NOT NULL,
	"conditions_raw" text,
	"valid_from" date,
	"valid_until" date,
	"source" "promo_source" NOT NULL,
	"source_url" text,
	"catalogue_page_id" uuid,
	"evidence_id" uuid,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" "promo_confidence" DEFAULT 'MEDIUM' NOT NULL,
	"verification" "promo_verification" DEFAULT 'NEEDS_VERIFICATION' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_product_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"product_id" uuid,
	"state" "resolution_state" NOT NULL,
	"matched_by" "matched_by" NOT NULL,
	"score" numeric(5, 4),
	"decided_by" "decided_by" NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_match_unique" UNIQUE("promotion_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "source_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"retailer_id" uuid,
	"store_id" uuid,
	"catalogue_id" uuid,
	"page" integer,
	"url" text,
	"storage_key" text,
	"raw_excerpt" text,
	"payload" jsonb,
	"content_hash" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text,
	"name_fr" text,
	"name_en" text,
	"servings" integer DEFAULT 2 NOT NULL,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"meal_types" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"cuisine" text,
	"instructions" jsonb,
	"image_key" text,
	"source" "recipe_source" DEFAULT 'user' NOT NULL,
	"ai_request" jsonb,
	"ingredient_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"food_concept_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "user_recipe_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_recipe_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "pantry_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid,
	"food_concept_id" uuid,
	"label" text,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL,
	"purchased_on" date,
	"expires_on" date,
	"opened_on" date,
	"status" "pantry_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"objective" "objective_preset" DEFAULT 'BALANCED' NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_user_week_unique" UNIQUE("user_id","week_start","status")
);
--> statement-breakpoint
CREATE TABLE "meal_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"slot_date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"recipe_id" uuid,
	"servings" integer DEFAULT 1 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"lock_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_slot_unique" UNIQUE("meal_plan_id","slot_date","meal_type")
);
--> statement-breakpoint
CREATE TABLE "shopping_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopping_plan_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"required_quantity" numeric(10, 3) NOT NULL,
	"required_unit" text NOT NULL,
	"purchase_quantity" numeric(10, 3) NOT NULL,
	"package_count" integer,
	"price_basis" "price_basis" DEFAULT 'unit' NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"effective_cost_cents" integer NOT NULL,
	"applied_promotion_id" uuid,
	"reasons" jsonb,
	"price_freshness" text DEFAULT 'fresh' NOT NULL,
	"status" "shopping_item_status" DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"meal_plan_id" uuid,
	"objective" "objective_preset" DEFAULT 'BALANCED' NOT NULL,
	"total_cents" integer,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"summary" jsonb,
	"solver_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_plan_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopping_plan_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"sequence_index" integer DEFAULT 0 NOT NULL,
	"estimated_travel_minutes" integer,
	CONSTRAINT "shopping_plan_store_unique" UNIQUE("shopping_plan_id","store_id")
);
--> statement-breakpoint
CREATE TABLE "ai_extraction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ai_extraction_kind" NOT NULL,
	"input_evidence_id" uuid,
	"user_id" text,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT '1' NOT NULL,
	"output" jsonb,
	"validation_status" "ai_validation_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"adapter" text,
	"kind" "ingestion_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"warnings" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_profile" ADD CONSTRAINT "nutrition_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_store_prefs" ADD CONSTRAINT "user_store_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_store_prefs" ADD CONSTRAINT "user_store_prefs_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users_profile" ADD CONSTRAINT "users_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_retailer_id_retailer_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_concept" ADD CONSTRAINT "food_concept_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_food_concept_id_food_concept_id_fk" FOREIGN KEY ("food_concept_id") REFERENCES "public"."food_concept"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_nutrition" ADD CONSTRAINT "product_nutrition_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_store_availability" ADD CONSTRAINT "product_store_availability_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue" ADD CONSTRAINT "catalogue_retailer_id_retailer_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue" ADD CONSTRAINT "catalogue_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_page" ADD CONSTRAINT "catalogue_page_catalogue_id_catalogue_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."catalogue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_retailer_id_retailer_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."retailer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_catalogue_id_catalogue_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."catalogue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_catalogue_page_id_catalogue_page_id_fk" FOREIGN KEY ("catalogue_page_id") REFERENCES "public"."catalogue_page"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product_match" ADD CONSTRAINT "promotion_product_match_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_product_match" ADD CONSTRAINT "promotion_product_match_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_evidence" ADD CONSTRAINT "source_evidence_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_food_concept_id_food_concept_id_fk" FOREIGN KEY ("food_concept_id") REFERENCES "public"."food_concept"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_prefs" ADD CONSTRAINT "user_recipe_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipe_prefs" ADD CONSTRAINT "user_recipe_prefs_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item" ADD CONSTRAINT "pantry_item_food_concept_id_food_concept_id_fk" FOREIGN KEY ("food_concept_id") REFERENCES "public"."food_concept"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan" ADD CONSTRAINT "meal_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slot" ADD CONSTRAINT "meal_slot_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_slot" ADD CONSTRAINT "meal_slot_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_shopping_plan_id_shopping_plan_id_fk" FOREIGN KEY ("shopping_plan_id") REFERENCES "public"."shopping_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_applied_promotion_id_promotion_id_fk" FOREIGN KEY ("applied_promotion_id") REFERENCES "public"."promotion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_plan" ADD CONSTRAINT "shopping_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_plan" ADD CONSTRAINT "shopping_plan_meal_plan_id_meal_plan_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_plan_store" ADD CONSTRAINT "shopping_plan_store_shopping_plan_id_shopping_plan_id_fk" FOREIGN KEY ("shopping_plan_id") REFERENCES "public"."shopping_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_plan_store" ADD CONSTRAINT "shopping_plan_store_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction" ADD CONSTRAINT "ai_extraction_input_evidence_id_source_evidence_id_fk" FOREIGN KEY ("input_evidence_id") REFERENCES "public"."source_evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extraction" ADD CONSTRAINT "ai_extraction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "store_lat_lng_idx" ON "store" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "store_retailer_idx" ON "store" USING btree ("retailer_id");--> statement-breakpoint
CREATE INDEX "store_owner_idx" ON "store" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "product_barcode_idx" ON "product" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "product_concept_idx" ON "product" USING btree ("food_concept_id");--> statement-breakpoint
CREATE INDEX "product_owner_idx" ON "product" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "price_obs_product_store_idx" ON "price_observation" USING btree ("product_id","store_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_obs_store_idx" ON "price_observation" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "price_obs_openprices_idx" ON "price_observation" USING btree ("openprices_id");--> statement-breakpoint
CREATE INDEX "catalogue_retailer_idx" ON "catalogue" USING btree ("retailer_id","valid_from");--> statement-breakpoint
CREATE INDEX "promotion_validity_idx" ON "promotion" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "promotion_retailer_idx" ON "promotion" USING btree ("retailer_id");--> statement-breakpoint
CREATE INDEX "promotion_store_idx" ON "promotion" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "promotion_barcode_idx" ON "promotion" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "evidence_owner_idx" ON "source_evidence" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "evidence_kind_idx" ON "source_evidence" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "recipe_owner_idx" ON "recipe" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredient_recipe_idx" ON "recipe_ingredient" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "pantry_user_idx" ON "pantry_item" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "meal_slot_plan_idx" ON "meal_slot" USING btree ("meal_plan_id");--> statement-breakpoint
CREATE INDEX "shopping_item_plan_idx" ON "shopping_item" USING btree ("shopping_plan_id");--> statement-breakpoint
CREATE INDEX "shopping_item_store_idx" ON "shopping_item" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "shopping_plan_user_idx" ON "shopping_plan" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ai_extraction_kind_idx" ON "ai_extraction" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_run_source_idx" ON "ingestion_run" USING btree ("source","started_at");