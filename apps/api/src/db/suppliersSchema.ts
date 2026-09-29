import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, numeric } from "drizzle-orm/pg-core";

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  gstNumber: text("gst_number"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  region: text("region"),
  pincode: text("pincode"),

    // --- Verification (KYC) ---
  gstVerified: boolean("gst_verified").notNull().default(false),
  verificationStatus: text("verification_status").notNull().default("pending"), // "pending" | "verified" | "rejected"
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"), // admin notes on rejection, etc.


  // --- Company profile fields ---
  companyOverview: text("company_overview"),
  businessType: text("business_type"),
  yearEstablished: integer("year_established"),
  totalEmployees: text("total_employees"),
  totalAnnualRevenue: text("total_annual_revenue"),
  mainProducts: text("main_products"),
  certifications: text("certifications"),

  // --- R&D capacity ---
  rdCapacity: text("rd_capacity"),

  // --- Trade capacity ---
  mainMarkets: jsonb("main_markets"),
  languagesSpoken: text("languages_spoken"),
  tradeDeptEmployees: text("trade_dept_employees"),
  averageLeadTimeDays: integer("average_lead_time_days"),

  // --- Business performance ---
  responseRate: integer("response_rate"),
  responseTimeHours: text("response_time_hours"),
  transactionsCount: integer("transactions_count"),
  totalTransactionAmount: text("total_transaction_amount"),
  quotationPerformance: integer("quotation_performance"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * A direct purchase order placed against a specific supplier from their
 * profile page — separate from procurementTasks (the AI-driven multi-quote
 * comparison flow).
 *
 * Order-level only as of the cart feature: a single order can contain
 * multiple line items (see supplierOrderItems below), so per-product
 * fields (itemName, unitPrice, quantity, per-item tax) moved off this
 * table. subtotal/taxAmount/shippingCost here are the SUMS across all of
 * an order's items, computed once at creation time — never recalculated
 * later even if a listing's price or tax settings change afterward, same
 * snapshotting principle as before, just rolled up instead of per-item.
 *
 * Defined in this file (not its own supplierOrdersSchema.ts) because
 * drizzle-kit's config loader doesn't reliably resolve cross-schema-file
 * .js imports the way tsx does at runtime — same issue we hit with
 * risk_assessments last night.
 */
export const supplierOrders = pgTable("supplier_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierId: uuid("supplier_id")
    .references(() => suppliers.id)
    .notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  subtotal: integer("subtotal"),     // sum of all items' subtotal
  taxAmount: integer("tax_amount"),  // sum of all items' taxAmount
  shippingCost: integer("shipping_cost"),
  total: integer("total"),           // subtotal + taxAmount + shippingCost
});

/**
 * One line item within a supplierOrder. productId is deliberately a plain
 * uuid (no .references()) to avoid a cross-file import to
 * supplyChainSchema.ts — same reasoning as the original supplierOrders
 * table; the relationship is enforced at the application level instead.
 */
export const supplierOrderItems = pgTable("supplier_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .references(() => supplierOrders.id, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id"),
  itemName: text("item_name").notNull(),
  unitPrice: integer("unit_price"), // denormalized from the product at order time
  quantity: integer("quantity").notNull(),
  taxType: text("tax_type"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  taxInclusive: boolean("tax_inclusive").notNull().default(false),
  subtotal: integer("subtotal"),   // unitPrice × quantity, tax excluded
  taxAmount: integer("tax_amount"),
});

export const supplierCertifications = pgTable("supplier_certifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierId: uuid("supplier_id").notNull(),
  certType: text("cert_type").notNull(),
  certNumber: text("cert_number"),
  issuedBy: text("issued_by"),
  validUntil: timestamp("valid_until"),
  documentUrl: text("document_url"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supplierVerificationEvents = pgTable("supplier_verification_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierId: uuid("supplier_id").notNull(),
  adminId: uuid("admin_id").notNull(),
  action: text("action").notNull(), // "verified" | "rejected"
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});