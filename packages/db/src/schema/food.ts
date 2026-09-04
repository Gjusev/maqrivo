import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  halalStateEnum,
  nutritionBasisEnum,
  productSourceEnum,
  purchasingModeEnum,
  shelfLifeClassEnum,
} from "./enums";
import { user } from "./auth";

/** Generic edible ("chicken breast") — what recipes ask for. Owner null = seeded/global. */
export const foodConcept = pgTable("food_concept", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  category: text("category").notNull(),
  shelfLifeClass: shelfLifeClassEnum("shelf_life_class").notNull().default("semi"),
  defaultUnit: text("default_unit").notNull().default("g"),
  // Reference nutrition per 100 g/ml — nullable per field, unknown is honest.
  energyKcal: integer("energy_kcal"),
  proteinG: numeric("protein_g", { precision: 6, scale: 2 }),
  carbohydrateG: numeric("carbohydrate_g", { precision: 6, scale: 2 }),
  fatG: numeric("fat_g", { precision: 6, scale: 2 }),
  saturatedFatG: numeric("saturated_fat_g", { precision: 6, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 6, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 6, scale: 2 }),
  saltG: numeric("salt_g", { precision: 6, scale: 3 }),
  basis: nutritionBasisEnum("basis").notNull().default("100g"),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Real purchasable retail item. Owner null = global (OFF import, seed). */
export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameFr: text("name_fr"),
    brand: text("brand"),
    barcode: text("barcode"),
    category: text("category"),
    foodConceptId: uuid("food_concept_id").references(() => foodConcept.id, { onDelete: "set null" }),
    purchasingMode: purchasingModeEnum("purchasing_mode").notNull().default("PACKAGED"),
    packageQuantity: numeric("package_quantity", { precision: 10, scale: 3 }),
    packageUnit: text("package_unit"),
    servingSize: text("serving_size"),
    imageKey: text("image_key"),
    source: productSourceEnum("source").notNull().default("user"),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    forkedFromProductId: uuid("forked_from_product_id"),
    halalState: halalStateEnum("halal_state").notNull().default("UNKNOWN"),
    halalEvidenceId: uuid("halal_evidence_id"),
    vegetarian: boolean("vegetarian"),
    vegan: boolean("vegan"),
    organic: boolean("organic"),
    ingredients: text("ingredients"),
    allergens: text("allergens").array().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_barcode_idx").on(t.barcode),
    index("product_concept_idx").on(t.foodConceptId),
    index("product_owner_idx").on(t.ownerUserId),
    unique("product_owner_barcode_unique").on(t.ownerUserId, t.barcode),
  ],
);

/** 1:1 nutrition, normalized per basis, with provenance. */
export const productNutrition = pgTable("product_nutrition", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => product.id, { onDelete: "cascade" }),
  basis: nutritionBasisEnum("basis").notNull().default("100g"),
  energyKcal: integer("energy_kcal"),
  proteinG: numeric("protein_g", { precision: 6, scale: 2 }),
  carbohydrateG: numeric("carbohydrate_g", { precision: 6, scale: 2 }),
  fatG: numeric("fat_g", { precision: 6, scale: 2 }),
  saturatedFatG: numeric("saturated_fat_g", { precision: 6, scale: 2 }),
  fiberG: numeric("fiber_g", { precision: 6, scale: 2 }),
  sugarsG: numeric("sugars_g", { precision: 6, scale: 2 }),
  saltG: numeric("salt_g", { precision: 6, scale: 3 }),
  source: text("source").notNull().default("user"), // off | user | label
  sourceUrl: text("source_url"),
  verified: boolean("verified").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sparse availability: absence of a row means unknown, not unavailable. */
export const productStoreAvailability = pgTable(
  "product_store_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    available: boolean("available").notNull().default(true),
    source: text("source"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("product_store_availability_unique").on(t.productId, t.storeId)],
);
