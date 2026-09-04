import { boolean, date, index, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import {
  decidedByEnum,
  matchedByEnum,
  promoConfidenceEnum,
  promoMechanismEnum,
  promoScopeEnum,
  promoSourceEnum,
  promoVerificationEnum,
  resolutionStateEnum,
} from "./enums";
import { retailer } from "./retail";
import { store } from "./retail";
import { product } from "./food";
import { user } from "./auth";

export const catalogue = pgTable(
  "catalogue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailer.id, { onDelete: "cascade" }),
    scope: promoScopeEnum("scope").notNull().default("store"),
    storeId: uuid("store_id").references(() => store.id, { onDelete: "cascade" }),
    regionKey: text("region_key"),
    externalId: text("external_id"),
    title: text("title"),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    sourceUrl: text("source_url"),
    evidenceId: uuid("evidence_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("catalogue_retailer_idx").on(t.retailerId, t.validFrom),
    unique("catalogue_external_unique").on(t.retailerId, t.externalId),
  ],
);

export const cataloguePage = pgTable(
  "catalogue_page",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogueId: uuid("catalogue_id")
      .notNull()
      .references(() => catalogue.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    imageKey: text("image_key"),
    sourceUrl: text("source_url"),
    contentHash: text("content_hash"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("catalogue_page_unique").on(t.catalogueId, t.pageNumber)],
);

/**
 * Normalized promotion. Mechanism parameters are typed columns (min_qty,
 * pay_qty, get_qty, discount_pct…) — core domain facts, not JSON soup.
 */
export const promotion = pgTable(
  "promotion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id")
      .notNull()
      .references(() => retailer.id, { onDelete: "cascade" }),
    catalogueId: uuid("catalogue_id").references(() => catalogue.id, { onDelete: "set null" }),
    storeId: uuid("store_id").references(() => store.id, { onDelete: "cascade" }),
    regionKey: text("region_key"),
    descriptionRaw: text("description_raw").notNull(),
    brand: text("brand"),
    barcode: text("barcode"),
    packageQuantity: numeric("package_quantity", { precision: 10, scale: 3 }),
    packageUnit: text("package_unit"),
    regularPriceCents: integer("regular_price_cents"),
    promoPriceCents: integer("promo_price_cents"),
    pricePerKgCents: integer("price_per_kg_cents"),
    mechanism: promoMechanismEnum("mechanism").notNull(),
    minQty: integer("min_qty"),
    maxQty: integer("max_qty"),
    payQty: integer("pay_qty"),
    getQty: integer("get_qty"),
    discountPct: integer("discount_pct"),
    loyaltyRequired: boolean("loyalty_required").notNull().default(false),
    conditionsRaw: text("conditions_raw"),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    source: promoSourceEnum("source").notNull(),
    sourceUrl: text("source_url"),
    cataloguePageId: uuid("catalogue_page_id").references(() => cataloguePage.id, {
      onDelete: "set null",
    }),
    evidenceId: uuid("evidence_id"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    confidence: promoConfidenceEnum("confidence").notNull().default("MEDIUM"),
    verification: promoVerificationEnum("verification").notNull().default("NEEDS_VERIFICATION"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("promotion_validity_idx").on(t.validUntil),
    index("promotion_retailer_idx").on(t.retailerId),
    index("promotion_store_idx").on(t.storeId),
    index("promotion_barcode_idx").on(t.barcode),
  ],
);

/** Product binding of a promotion, with match provenance. UNRESOLVED stays unbound. */
export const promotionProductMatch = pgTable(
  "promotion_product_match",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotion.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => product.id, { onDelete: "cascade" }),
    state: resolutionStateEnum("state").notNull(),
    matchedBy: matchedByEnum("matched_by").notNull(),
    score: numeric("score", { precision: 5, scale: 4 }),
    decidedBy: decidedByEnum("decided_by").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("promotion_match_unique").on(t.promotionId, t.productId)],
);
