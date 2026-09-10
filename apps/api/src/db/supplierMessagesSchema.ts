import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const supplierMessages = pgTable("supplier_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Deliberately a plain uuid, not .references() — drizzle-kit's schema
  // bundler can't resolve cross-file imports between files listed in
  // drizzle.config.ts's schema array. The real foreign key constraint is
  // added directly via SQL after migration instead (same pattern used for
  // supplier_offers.supplier_id).
  supplierId: uuid("supplier_id").notNull(),
  senderName: text("sender_name").notNull(),
  senderEmail: text("sender_email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});