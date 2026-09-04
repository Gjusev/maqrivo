import { doublePrecision, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { retailerKindEnum, storeOriginEnum } from "./enums";
import { user } from "./auth";

export const retailer = pgTable("retailer", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // 'carrefour', 'intermarche', …
  name: text("name").notNull(),
  nameFr: text("name_fr"),
  kind: retailerKindEnum("kind").notNull().default("chain"),
  /** Adapter implementation available in this build; null = discovery-only. */
  adapter: text("adapter"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const store = pgTable(
  "store",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    retailerId: uuid("retailer_id").references(() => retailer.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    format: text("format"), // supermarket, city, express, drive, butcher, …
    address: text("address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    openingHours: jsonb("opening_hours"), // OSM-style weekly schedule
    origin: storeOriginEnum("origin").notNull(),
    /** Owner for private custom stores; null = shared/global. */
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    source: text("source"),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    tags: text("tags").array().notNull().default([]),
    website: text("website"),
    phone: text("phone"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("store_lat_lng_idx").on(t.lat, t.lng),
    index("store_retailer_idx").on(t.retailerId),
    index("store_owner_idx").on(t.ownerUserId),
  ],
);
