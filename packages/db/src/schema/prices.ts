import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { priceBasisEnum, priceSourceEnum } from "./enums";
import { product } from "./food";
import { store } from "./retail";

/**
 * Append-only price observations. The "current price" is a query (latest
 * fresh observation per product+store), never a column on product.
 */
export const priceObservation = pgTable(
  "price_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    priceBasis: priceBasisEnum("price_basis").notNull().default("unit"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    source: priceSourceEnum("source").notNull().default("user"),
    openpricesId: text("openprices_id"),
    discounted: boolean("discounted").notNull().default(false),
    regularAmountCents: integer("regular_amount_cents"),
    evidenceId: uuid("evidence_id"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("price_obs_product_store_idx").on(t.productId, t.storeId, t.observedAt),
    index("price_obs_store_idx").on(t.storeId),
    index("price_obs_openprices_idx").on(t.openpricesId),
  ],
);
