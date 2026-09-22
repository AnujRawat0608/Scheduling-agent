import { pgTable, uuid, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

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
 * Defined in this file (not its own supplierOrdersSchema.ts) because
 * drizzle-kit's config loader doesn't reliably resolve cross-schema-file
 * .js imports the way tsx does at runtime — same issue we hit with
 * risk_assessments last night. productId is deliberately a plain uuid
 * (no .references()) to avoid a cross-file import to supplyChainSchema.ts;
 * the relationship is enforced at the application level instead.
 */
export const supplierOrders = pgTable("supplier_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierId: uuid("supplier_id")
    .references(() => suppliers.id)
    .notNull(),
  productId: uuid("product_id"),
  itemName: text("item_name").notNull(),
  unitPrice: integer("unit_price"), // denormalized from the product at order time, so Billing has a real total even if the listing changes later
  quantity: integer("quantity").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

