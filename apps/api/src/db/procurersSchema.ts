import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const procurers = pgTable("procurers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // we always store it lowercase
  passwordHash: text("password_hash").notNull(), // never the real password
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});