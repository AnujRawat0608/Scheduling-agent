import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const procurers = pgTable("procurers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // we always store it lowercase
  passwordHash: text("password_hash").notNull(), // never the real password
  companyName: text("company_name"),
  // Legacy free-text field. No longer collected: use `country` instead.
  region: text("region"),
  // Full English country name from lib/countries.ts. This is the DELIVERY DESTINATION
  // for the route risk check.
  country: text("country"),
  contactName: text("contact_name"),
  phone: text("phone"),
  gstNumber: text("gst_number"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});