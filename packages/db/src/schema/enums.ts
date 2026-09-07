import { pgEnum } from "drizzle-orm/pg-core";

// ── Food & products ──────────────────────────────────────────────────────────
export const purchasingModeEnum = pgEnum("purchasing_mode", ["PACKAGED", "WEIGHT", "UNIT"]);
export const halalStateEnum = pgEnum("halal_state", ["CONFIRMED", "CLAIMED", "UNKNOWN", "NOT_HALAL"]);
export const productSourceEnum = pgEnum("product_source", ["off", "user", "retailer", "seed"]);
export const shelfLifeClassEnum = pgEnum("shelf_life_class", ["storable", "semi", "fresh"]);
export const nutritionBasisEnum = pgEnum("nutrition_basis", ["100g", "100ml"]);

// ── Prices & promotions ─────────────────────────────────────────────────────
export const priceBasisEnum = pgEnum("price_basis", ["unit", "per_kg", "per_100g", "per_l", "per_100ml"]);
export const priceSourceEnum = pgEnum("price_source", [
  "user",
  "openprices",
  "retailer",
  "catalogue",
  "receipt",
  "manual",
]);
export const promoMechanismEnum = pgEnum("promo_mechanism", [
  "PROMO_PRICE",
  "PERCENTAGE_OFF",
  "MULTIBUY",
  "BUY_X_GET_Y",
  "SECOND_UNIT_DISCOUNT",
  "LOYALTY_PRICE",
  "LOYALTY_CREDIT",
  "CASHBACK",
  "COUPON",
  "CATEGORY_PROMO",
]);
export const promoScopeEnum = pgEnum("promo_scope", ["national", "region", "store"]);
export const promoSourceEnum = pgEnum("promo_source", ["catalogue", "user", "retailer", "openprices"]);
export const promoConfidenceEnum = pgEnum("promo_confidence", ["HIGH", "MEDIUM", "LOW"]);
export const promoVerificationEnum = pgEnum("promo_verification", [
  "OFFICIAL",
  "EXTRACTED",
  "USER_OBSERVED",
  "NEEDS_VERIFICATION",
  "STALE",
  "EXPIRED",
]);
export const resolutionStateEnum = pgEnum("resolution_state", ["EXACT", "PROBABLE", "AMBIGUOUS", "UNRESOLVED"]);
export const matchedByEnum = pgEnum("matched_by", [
  "barcode",
  "retailer_id",
  "brand_name_packaging",
  "none",
]);
export const decidedByEnum = pgEnum("decided_by", ["rule", "ai", "user"]);

// ── Stores ──────────────────────────────────────────────────────────────────
export const storeOriginEnum = pgEnum("store_origin", [
  "osm",
  "retailer",
  "openprices",
  "supermarche",
  "user",
]);
export const retailerKindEnum = pgEnum("retailer_kind", ["chain", "independent"]);

// ── Recipes & planning ──────────────────────────────────────────────────────
export const recipeSourceEnum = pgEnum("recipe_source", ["user", "ai", "import", "seed"]);
export const pantryStatusEnum = pgEnum("pantry_status", [
  "active",
  "used_up",
  "discarded",
  "consumed_by_plan",
]);
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);
export const planStatusEnum = pgEnum("plan_status", ["draft", "active", "archived"]);
export const shoppingItemStatusEnum = pgEnum("shopping_item_status", [
  "pending",
  "purchased",
  "unavailable",
  "skipped",
]);
export const objectivePresetEnum = pgEnum("objective_preset", [
  "CHEAPEST",
  "BALANCED",
  "FEWEST_STORES",
  "MINIMUM_TRAVEL",
  "MAX_PROTEIN_PER_EURO",
  "PROMOTION_FOCUSED",
  "LOW_WASTE",
]);
export const travelSensitivityEnum = pgEnum("travel_sensitivity", ["low", "medium", "high"]);

// ── Operations ──────────────────────────────────────────────────────────────
export const ingestionKindEnum = pgEnum("ingestion_kind", [
  "store_refresh",
  "catalogue_discovery",
  "catalogue_ingestion",
  "price_refresh",
  "promotion_expiry",
  "product_resolution",
  "pantry_consumption",
]);
export const runStatusEnum = pgEnum("run_status", ["running", "succeeded", "failed", "partial"]);
export const evidenceKindEnum = pgEnum("evidence_kind", [
  "retailer_page",
  "catalogue",
  "catalogue_page",
  "openprices_proof",
  "receipt_photo",
  "product_photo",
  "manual_observation",
  "api_payload",
]);
export const aiExtractionKindEnum = pgEnum("ai_extraction_kind", [
  "catalogue_page",
  "product_photo",
  "recipe_candidate",
  "match_assist",
]);
export const aiValidationEnum = pgEnum("ai_validation_status", ["valid", "repaired", "rejected"]);
