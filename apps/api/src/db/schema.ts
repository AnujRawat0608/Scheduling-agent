import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

/**
 * One row per agent invocation. `threadId` is the LangGraph thread id
 * used by the Postgres checkpointer to resume/replay this run.
 */
export const schedulingRuns = pgTable("scheduling_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  organizerId: text("organizer_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("gathering"),
  request: jsonb("request").notNull(),
  selectedSlot: jsonb("selected_slot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Pending human-in-the-loop decisions. The graph writes here (or just
 * flags approvalRequest in state — this table is for fast UI queries
 * and audit trail) and interrupts; a human resolves it via the API,
 * which resumes the graph from its checkpoint.
 */
export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => schedulingRuns.id)
    .notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull(), // TimeSlot[]
  allowFreeform: boolean("allow_freeform").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolution: jsonb("resolution"), // what the human picked / typed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * OAuth tokens for organizers only — attendees never connect anything,
 * they just receive a normal email invite. One row per organizer who
 * has authorized the app (see routes/auth.ts).
 * Encrypt accessToken/refreshToken at rest in a real deployment
 * (e.g. via pgcrypto or an app-level KMS-backed cipher) — stored
 * plain here only as a scaffold placeholder.
 */
export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userEmail: text("user_email").notNull().unique(),
  provider: text("provider").notNull().default("google"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Lightweight event log per run — useful for the UI timeline and for
 * correlating with Langfuse traces (store the langfuseTraceId here).
 */
export const runEvents = pgTable("run_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => schedulingRuns.id)
    .notNull(),
  node: text("node").notNull(),
  payload: jsonb("payload"),
  langfuseTraceId: text("langfuse_trace_id"),
  sequence: integer("sequence").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Risk assessment for a run's selected supplier/route, from the
 * Supply Chain Risk Agent (separate service). One row per check —
 * a run can accumulate several if risk is re-checked before approval.
 */
export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .references(() => schedulingRuns.id)
    .notNull(),
  supplierRegion: text("supplier_region").notNull(),
  destinationRegion: text("destination_region"),
  overallStatus: text("overall_status").notNull(), // "green" | "yellow" | "red" | "unknown"
  recommendation: text("recommendation").notNull(),
  rawResponse: jsonb("raw_response").notNull(), // full RouteRiskResponse payload for drill-down
  wasAvailable: boolean("was_available").default(true).notNull(), // false if risk agent was unreachable
  createdAt: timestamp("created_at").defaultNow().notNull(),
});