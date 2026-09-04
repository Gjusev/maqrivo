import { date, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pantryStatusEnum } from "./enums";
import { user } from "./auth";
import { product } from "./food";
import { foodConcept } from "./food";

export const pantryItem = pgTable(
  "pantry_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    foodConceptId: uuid("food_concept_id").references(() => foodConcept.id, { onDelete: "set null" }),
    label: text("label"), // free-text when neither product nor concept is set
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
    unit: text("unit").notNull().default("g"),
    purchasedOn: date("purchased_on"),
    expiresOn: date("expires_on"),
    openedOn: date("opened_on"),
    status: pantryStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pantry_user_idx").on(t.userId, t.status)],
);
