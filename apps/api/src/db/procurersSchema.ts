import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const procurers = pgTable("procurers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // we always store it lowercase
  passwordHash: text("password_hash").notNull(), // never the real password
  companyName: text("company_name"),
  region: text("region"),
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