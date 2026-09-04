import { boolean, date, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { store } from "./retail";
import { product } from "./food";

/**
 * Receipt ingestion (spec: photo → candidate lines → user confirms →
 * purchase records + price observations → optional pantry updates).
 * A receipt is a purchase record anchored to a store, a date, and the
 * ticket photo as evidence. Lines keep the verbatim label; matching to
 * products happens at confirmation time and is always explicit.
 */
export const receipt = pgTable(
  "receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    purchasedOn: date("purchased_on").notNull(),
    evidenceId: uuid("evidence_id"),
    totalCents: integer("total_cents"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipt_user_idx").on(t.userId, t.purchasedOn)],
);

export const receiptLine = pgTable(
  "receipt_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => receipt.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Kilograms when the line is sold by weight (prix au kg lines). */
    quantityKg: numeric("quantity_kg", { precision: 8, scale: 3 }),
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    priceObservationId: uuid("price_observation_id"),
    confirmed: boolean("confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipt_line_receipt_idx").on(t.receiptId)],
);
