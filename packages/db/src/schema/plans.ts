import {
  boolean,
  date,
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
import { mealTypeEnum, objectivePresetEnum, planStatusEnum, priceBasisEnum, shoppingItemStatusEnum } from "./enums";
import { user } from "./auth";
import { recipe } from "./recipes";
import { store } from "./retail";
import { product } from "./food";
import { promotion } from "./promotions";

export const mealPlan = pgTable(
  "meal_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(), // always a Monday
    objective: objectivePresetEnum("objective").notNull().default("BALANCED"),
    status: planStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("meal_plan_user_week_unique").on(t.userId, t.weekStart, t.status)],
);

export const mealSlot = pgTable(
  "meal_slot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealPlanId: uuid("meal_plan_id")
      .notNull()
      .references(() => mealPlan.id, { onDelete: "cascade" }),
    slotDate: date("slot_date").notNull(),
    mealType: mealTypeEnum("meal_type").notNull(),
    recipeId: uuid("recipe_id").references(() => recipe.id, { onDelete: "set null" }),
    servings: integer("servings").notNull().default(1),
    locked: boolean("locked").notNull().default(false),
    lockReason: text("lock_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("meal_slot_unique").on(t.mealPlanId, t.slotDate, t.mealType),
    index("meal_slot_plan_idx").on(t.mealPlanId),
  ],
);

export const shoppingPlan = pgTable(
  "shopping_plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mealPlanId: uuid("meal_plan_id").references(() => mealPlan.id, { onDelete: "set null" }),
    objective: objectivePresetEnum("objective").notNull().default("BALANCED"),
    totalCents: integer("total_cents"),
    currency: text("currency").notNull().default("EUR"),
    status: planStatusEnum("status").notNull().default("active"),
    /** Snapshot of deterministic totals + optimizer summary: survives price drift. */
    summary: jsonb("summary"),
    solverStatus: text("solver_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shopping_plan_user_idx").on(t.userId, t.status)],
);

export const shoppingPlanStore = pgTable(
  "shopping_plan_store",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shoppingPlanId: uuid("shopping_plan_id")
      .notNull()
      .references(() => shoppingPlan.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    sequenceIndex: integer("sequence_index").notNull().default(0),
    estimatedTravelMinutes: integer("estimated_travel_minutes"),
  },
  (t) => [unique("shopping_plan_store_unique").on(t.shoppingPlanId, t.storeId)],
);

export const shoppingItem = pgTable(
  "shopping_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shoppingPlanId: uuid("shopping_plan_id")
      .notNull()
      .references(() => shoppingPlan.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
    requiredQuantity: numeric("required_quantity", { precision: 10, scale: 3 }).notNull(),
    requiredUnit: text("required_unit").notNull(),
    purchaseQuantity: numeric("purchase_quantity", { precision: 10, scale: 3 }).notNull(),
    packageCount: integer("package_count"),
    priceBasis: priceBasisEnum("price_basis").notNull().default("unit"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    effectiveCostCents: integer("effective_cost_cents").notNull(),
    appliedPromotionId: uuid("applied_promotion_id").references(() => promotion.id, {
      onDelete: "set null",
    }),
    /** Deterministic reason codes + parameters from the optimizer. */
    reasons: jsonb("reasons").$type<{ code: string; params?: Record<string, number | string> }[]>(),
    priceFreshness: text("price_freshness").notNull().default("fresh"), // fresh | stale | unknown
    status: shoppingItemStatusEnum("status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("shopping_item_plan_idx").on(t.shoppingPlanId),
    index("shopping_item_store_idx").on(t.storeId),
  ],
);
