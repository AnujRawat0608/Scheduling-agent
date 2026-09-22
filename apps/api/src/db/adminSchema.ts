import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("reviewer"), // "super_admin" | "reviewer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});