import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { evidenceKindEnum } from "./enums";
import { user } from "./auth";

/**
 * First-class provenance: every external fact (price, promotion, halal claim)
 * can point here. Uploads are owner-private; URLs and payloads are shared.
 */
export const sourceEvidence = pgTable(
  "source_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: evidenceKindEnum("kind").notNull(),
    retailerId: uuid("retailer_id"),
    storeId: uuid("store_id"),
    catalogueId: uuid("catalogue_id"),
    page: integer("page"),
    url: text("url"),
    storageKey: text("storage_key"), // uploaded file on the volume
    rawExcerpt: text("raw_excerpt"),
    payload: jsonb("payload"),
    contentHash: text("content_hash"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evidence_owner_idx").on(t.ownerUserId), index("evidence_kind_idx").on(t.kind)],
);
