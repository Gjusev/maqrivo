import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { aiExtractionKindEnum, aiValidationEnum, ingestionKindEnum, runStatusEnum } from "./enums";
import { user } from "./auth";
import { sourceEvidence } from "./evidence";

export const ingestionRun = pgTable(
  "ingestion_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // 'carrefour' | 'openprices' | 'osm' | …
    adapter: text("adapter"),
    kind: ingestionKindEnum("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: runStatusEnum("status").notNull().default("running"),
    stats: jsonb("stats").$type<Record<string, number>>(),
    warnings: jsonb("warnings").$type<string[]>(),
    error: text("error"),
  },
  (t) => [index("ingestion_run_source_idx").on(t.source, t.startedAt)],
);

export const aiExtraction = pgTable(
  "ai_extraction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: aiExtractionKindEnum("kind").notNull(),
    inputEvidenceId: uuid("input_evidence_id").references(() => sourceEvidence.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull().default("1"),
    output: jsonb("output"),
    validationStatus: aiValidationEnum("validation_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_extraction_kind_idx").on(t.kind, t.createdAt)],
);
