import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { objectivePresetEnum, travelSensitivityEnum } from "./enums";
import { store } from "./retail";

/**
 * Better Auth tables (v1 documented schema) plus the Maqrivo profile that
 * hangs off the user. `user.id` is a text key minted by Better Auth.
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer"), // Better Auth 1.7: account identity is scoped by issuer
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("account_provider_account_unique").on(t.providerId, t.accountId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Maqrivo profile: locale, approximate home location, privacy granularity. */
export const usersProfile = pgTable("users_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  locale: text("locale").notNull().default("fr"), // 'en' | 'fr'
  displayName: text("display_name"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  locationLabel: text("location_label"),
  /** Snap radius in metres applied before any external geo call. */
  locationGranularityM: integer("location_granularity_m").notNull().default(1500),
  currency: text("currency").notNull().default("EUR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Manual nutrition targets — never AI-computed. Latest row wins. */
export const nutritionProfile = pgTable("nutrition_profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  dailyKcal: integer("daily_kcal"),
  proteinG: integer("protein_g"),
  carbohydrateG: integer("carbohydrate_g"),
  fatG: integer("fat_g"),
  fiberG: integer("fiber_g"),
  mealsPerDay: integer("meals_per_day").notNull().default(3),
  weeklyBudgetCents: integer("weekly_budget_cents"),
  halalRequired: boolean("halal_required").notNull().default(false),
  allowUnknownHalal: boolean("allow_unknown_halal").notNull().default(false),
  vegetarian: boolean("vegetarian").notNull().default(false),
  vegan: boolean("vegan").notNull().default(false),
  allergens: text("allergens").array().notNull().default([]),
  excludedConcepts: text("excluded_concepts").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  searchRadiusM: integer("search_radius_m").notNull().default(2000),
  maxStoresInPlan: integer("max_stores_in_plan").notNull().default(3),
  travelSensitivity: travelSensitivityEnum("travel_sensitivity").notNull().default("medium"),
  defaultObjective: objectivePresetEnum("default_objective").notNull().default("BALANCED"),
  maxCookingMinutes: integer("max_cooking_minutes"),
  maxDistinctRecipes: integer("max_distinct_recipes"),
  repetitionTolerance: integer("repetition_tolerance").notNull().default(2),
  preferredCuisines: text("preferred_cuisines").array().notNull().default([]),
  loyaltyRetailers: text("loyalty_retailers").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-user store settings — the two-tier enabled/favorite/avoided model. */
export const userStorePrefs = pgTable(
  "user_store_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    favorite: boolean("favorite").notNull().default(false),
    avoided: boolean("avoided").notNull().default(false),
    distanceM: integer("distance_m"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("user_store_unique").on(t.userId, t.storeId)],
);
