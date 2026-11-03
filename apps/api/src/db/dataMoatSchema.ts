// apps/api/src/db/dataMoatSchema.ts
//
// Drizzle definitions for tables created by data_moat_migration.sql.
// The SQL file is the source of truth. Do NOT add this file to the "schema" path in
// drizzle.config.ts, or drizzle-kit will try to create tables that already exist.
//
// If your suppliers/buyers/orders tables use non-UUID ids, change the uuid() columns
// below (and the SQL columns) to match.

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  boolean,
  date,
} from "drizzle-orm/pg-core";

export const priceObservations = pgTable("price_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull(), // 'web_quote' | 'catalog' | 'supplier_quote'
  supplierId: uuid("supplier_id"),
  supplierName: text("supplier_name").notNull(),
  supplierUrl: text("supplier_url"),
  catalogProductId: uuid("catalog_product_id"),
  partKey: text("part_key").notNull(),
  partRaw: text("part_raw").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  unit: text("unit"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  moq: integer("moq"),
  leadTimeDays: integer("lead_time_days"),
  originCountry: text("origin_country"),
  incoterm: text("incoterm"),
  shippingCost: numeric("shipping_cost", { precision: 14, scale: 2 }),
  taxInclusive: boolean("tax_inclusive"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 2 }),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  runId: text("run_id"),
  rawPayload: jsonb("raw_payload"),
});

export const planDecisions = pgTable("plan_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: text("run_id").notNull(),
  buyerId: uuid("buyer_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  decision: text("decision").notNull(), // 'approved' | 'rejected' | 'edited'
  rejectReason: text("reject_reason"),
  rejectCategory: text("reject_category"),
  optionsShown: jsonb("options_shown").notNull(),
  optionChosen: jsonb("option_chosen"),
  chosenSupplierId: uuid("chosen_supplier_id"),
  chosenTotalValue: numeric("chosen_total_value", { precision: 14, scale: 2 }),
  chosenCurrency: text("chosen_currency"),
  searchScope: text("search_scope"),
  riskCheckEnabled: boolean("risk_check_enabled").notNull().default(false),
  riskStatus: text("risk_status"),
  chosenPlanIndex: integer("chosen_plan_index"), // 0 = recommended plan, 1+ = an alternative
});

export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: text("run_id"),
  supplierId: uuid("supplier_id"),
  supplierName: text("supplier_name").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  quotedPrice: numeric("quoted_price", { precision: 14, scale: 4 }),
  currency: text("currency"),
});

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  recordedBy: text("recorded_by").notNull(),
  promisedDate: date("promised_date"),
  invoicedPrice: numeric("invoiced_price", { precision: 14, scale: 4 }),
  currency: text("currency"),
  notes: text("notes"),
});