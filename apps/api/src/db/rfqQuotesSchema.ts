import { pgTable, uuid, text, integer, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { rfqs } from "./rfqsSchema.js";
import { suppliers } from "./suppliersSchema.js";

/**
 * A supplier's quoted response to a specific RFQ. One row per RFQ per
 * supplier — since rfqs.supplierId is singular (an RFQ currently targets
 * one supplier, not a broadcast to many), there's at most one quote per
 * RFQ today, but this is modeled as its own table (rather than columns
 * on rfqs) so a future multi-supplier RFQ can have many quotes without
 * a schema change.
 */
export const rfqQuotes = pgTable("rfq_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  rfqId: uuid("rfq_id")
    .references(() => rfqs.id, { onDelete: "cascade" })
    .notNull(),
  supplierId: uuid("supplier_id")
    .references(() => suppliers.id)
    .notNull(),
  currency: text("currency"),
  totalPrice: integer("total_price"), // sum across line items, in the quote's currency's smallest sane unit (e.g. whole rupees)
  leadTimeDays: integer("lead_time_days"),
  validUntil: timestamp("valid_until"),
  paymentTerms: text("payment_terms"),
  notes: text("notes"),
  // Per-line-item pricing, shaped to mirror rfqs.lineItems:
  // [{ productName, specification, unit, quantity, unitPrice, lineTotal }]
  lineItemQuotes: jsonb("line_item_quotes").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});