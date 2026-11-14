import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { suppliers } from "./suppliersSchema.js";
import { procurers } from "./procurersSchema.js";

/**
 * One row per RFQ sent from a procurer to a supplier.
 *
 * `procurerId` is the signed-in buyer who owns the RFQ; the accept / request-revision routes check it.
 * RFQs created before it was being saved have it null, so they can't be accepted until it's set by hand.
 *
 * The supplier is EITHER a catalog supplier (`supplierId` set, supplierType "directory") OR an external
 * supplier invited by email (`supplierId` null until they submit a quote, supplierType "external").
 * For external suppliers `supplierName` / `supplierEmail` hold who the RFQ was sent to.
 */
export const rfqs = pgTable("rfqs", {
  id: uuid("id").defaultRandom().primaryKey(),

  /** Null only for an external supplier who hasn't onboarded yet (set when they submit their quote). */
  supplierId: uuid("supplier_id").references(() => suppliers.id),

  /** "directory" = picked from the supplier list / created by the agent; "external" = invited by email. */
  supplierType: text("supplier_type").notNull().default("directory"),
  supplierName: text("supplier_name"),
  supplierEmail: text("supplier_email"),
  supplierContactName: text("supplier_contact_name"),
  supplierCountry: text("supplier_country"),

  procurerId: uuid("procurer_id").references(() => procurers.id),

  /** Set when the procurement agent created this RFQ (null for RFQs sent by hand). */
  taskId: uuid("task_id"),

  referenceNumber: text("reference_number").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),

  /**
   * "draft" | "sent" | "quoted" | "revision_requested" | "accepted"
   * sent → quoted (supplier's one quote is final) → accepted,
   * or quoted → revision_requested (buyer asks for changes) → quoted (supplier's one new quote).
   */
  status: text("status").notNull().default("sent"),

  // --- Buyer-requested quote revisions ("bargain reset") ---
  revisionCount: integer("revision_count").notNull().default(0),
  revisionNote: text("revision_note"),
  revisionRequestedAt: timestamp("revision_requested_at"),
  /** Set when the supplier declines a revision request and keeps the original quote (their reason). */
  revisionReply: text("revision_reply"),

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
  /** Named port/city the Incoterm applies to, e.g. "Shenzhen" for "FOB Shenzhen". */
  incotermPlace: text("incoterm_place"),
  packagingRequirements: text("packaging_requirements"),

  // Quality, warranty & compliance
  warrantyPeriod: text("warranty_period"),
  qualityRequirements: text("quality_requirements"),
  requiredCertifications: text("required_certifications"),
  insuranceRequired: boolean("insurance_required").notNull().default(false),
  /** Legacy filenames-only list. Real files now live in the rfq_attachments table. */
  technicalDocumentNames: jsonb("technical_document_names").notNull().default([]),

  notes: text("notes"),

  // --- In-app notification state ---
  isRead: boolean("is_read").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});