import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

export const procurementTasks = pgTable("procurement_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  requesterEmail: text("requester_email").notNull(),
  itemsSummary: text("items_summary").notNull(),
  lineItemCount: integer("line_item_count").notNull(),
  status: text("status").notNull().default("extracting"),
  request: jsonb("request").notNull(),
  recommendedPlan: jsonb("recommended_plan"),
  totalCost: integer("total_cost"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Risk assessment for a procurement task's selected supplier/route, from
 * the Supply Chain Risk Agent (separate service). One row per check — a
 * task can accumulate several if risk is re-checked before approval.
 *
 * Defined in this file (not its own riskAssessmentsSchema.ts) because
 * drizzle-kit's config loader doesn't reliably resolve cross-schema-file
 * .js imports the way tsx does at runtime — keeping same-domain tables
 * that reference each other in one file avoids that entirely.
 */
export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .references(() => procurementTasks.id)
    .notNull(),
  supplierRegion: text("supplier_region").notNull(),
  destinationRegion: text("destination_region"),
  overallStatus: text("overall_status").notNull(),
  recommendation: text("recommendation").notNull(),
  rawResponse: jsonb("raw_response").notNull(),
  wasAvailable: boolean("was_available").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});