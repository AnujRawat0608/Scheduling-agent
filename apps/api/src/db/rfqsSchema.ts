import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { suppliers } from "./suppliersSchema.js";
import { procurers } from "./procurersSchema.js";

/**
 * One row per RFQ sent from a procurer to a supplier.
 *
 * NOTE: there's no procurer/buyer login system yet (same gap flagged in
 * supplierProfile.ts), so `requesterName` / `requesterEmail` are plain
 * text captured on the form rather than a foreign key to a procurer
 * account. If buyer accounts get built later, add a procurerId column
 * and backfill from these fields.
 */
export const rfqs = pgTable("rfqs", {
  id: uuid("id").defaultRandom().primaryKey(),

  supplierId: uuid("supplier_id")
    .references(() => suppliers.id)
    .notNull(),

    procurerId: uuid("procurer_id").references(() => procurers.id),

  /** Set when the procurement agent created this RFQ (null for RFQs sent by hand). */
  taskId: uuid("task_id"),

  referenceNumber: text("reference_number").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),

  status: text("status").notNull().default("sent"), // "draft" | "sent" | "quoted"

  currency: text("currency"),
  dueDate: timestamp("due_date"),
  priceValidUntil: timestamp("price_valid_until"),

  /** Array of { productName, specification, unit, quantity } */
  lineItems: jsonb("line_items").notNull().default([]),

  // Technical specification & scope
  scopeNotes: text("scope_notes"),
  assumptionsExclusions: text("assumptions_exclusions"),

  // Payment terms
  paymentTerms: text("payment_terms"),

  // Delivery & logistics
  deliveryAddress: text("delivery_address"),
  requiredDeliveryDate: timestamp("required_delivery_date"),
  incoterm: text("incoterm"),
  packagingRequirements: text("packaging_requirements"),

  // Quality, warranty & compliance
  warrantyPeriod: text("warranty_period"),
  qualityRequirements: text("quality_requirements"),
  requiredCertifications: text("required_certifications"),
  insuranceRequired: boolean("insurance_required").notNull().default(false),
  /** Filenames only for now — see mailer.ts / rfqs.ts route comments re: real file storage. */
  technicalDocumentNames: jsonb("technical_document_names").notNull().default([]),

  notes: text("notes"),

  // --- In-app notification state ---
  isRead: boolean("is_read").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});