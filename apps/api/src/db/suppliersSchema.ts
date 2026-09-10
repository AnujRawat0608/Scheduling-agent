import { pgTable, uuid, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

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
  pincode: text("pincode"),

  // --- Company profile fields ---
  companyOverview: text("company_overview"),
  businessType: text("business_type"), // e.g. "Trading Company", "Manufacturer"
  yearEstablished: integer("year_established"),
  totalEmployees: text("total_employees"), // range string, e.g. "11-50 People"
  totalAnnualRevenue: text("total_annual_revenue"), // range string
  mainProducts: text("main_products"), // short comma-separated description
  certifications: text("certifications"),

  // --- R&D capacity ---
  rdCapacity: text("rd_capacity"), // free-text description of R&D capabilities

  // --- Trade capacity ---
  // mainMarkets: [{ region: "Southern Europe", percentage: 30 }, ...]
  mainMarkets: jsonb("main_markets"),
  languagesSpoken: text("languages_spoken"), // comma-separated
  tradeDeptEmployees: text("trade_dept_employees"), // range string
  averageLeadTimeDays: integer("average_lead_time_days"),

  // --- Business performance ---
  responseRate: integer("response_rate"), // percentage, 0-100
  responseTimeHours: text("response_time_hours"), // e.g. "≤4h"
  transactionsCount: integer("transactions_count"),
  totalTransactionAmount: text("total_transaction_amount"), // e.g. "60,000+"
  quotationPerformance: integer("quotation_performance"), // count of quotes given

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});