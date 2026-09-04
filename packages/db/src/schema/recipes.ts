import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { recipeSourceEnum } from "./enums";
import { user } from "./auth";
import { foodConcept } from "./food";

export const recipe = pgTable(
  "recipe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    nameFr: text("name_fr"),
    nameEn: text("name_en"),
    servings: integer("servings").notNull().default(2),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    mealTypes: text("meal_types").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    cuisine: text("cuisine"),
    instructions: jsonb("instructions").$type<string[]>(),
    imageKey: text("image_key"),
    source: recipeSourceEnum("source").notNull().default("user"),
    aiRequest: jsonb("ai_request"),
    /** Cache-buster: bumped when ingredients change; totals always recomputed. */
    ingredientVersion: integer("ingredient_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recipe_owner_idx").on(t.ownerUserId)],
);

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    foodConceptId: uuid("food_concept_id")
      .notNull()
      .references(() => foodConcept.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("g"), // g | kg | ml | l | unit | pack
    isOptional: boolean("is_optional").notNull().default(false),
    note: text("note"),
  },
  (t) => [index("recipe_ingredient_recipe_idx").on(t.recipeId)],
);

export const userRecipePrefs = pgTable(
  "user_recipe_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    favorite: boolean("favorite").notNull().default(false),
  },
  (t) => [unique("user_recipe_unique").on(t.userId, t.recipeId)],
);
