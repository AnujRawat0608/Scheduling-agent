import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const supplierOffers = pgTable("supplier_offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Deliberately NOT using .references(() => suppliers.id) here — drizzle-kit's
  // schema bundler can't resolve cross-file imports between files listed in
  // drizzle.config.ts's schema array (it requires the literal ./file.js path
  // even though the project uses tsx's .js-to-.ts ESM resolution everywhere
  // else). The actual foreign key constraint is added directly via SQL in
  // the migration instead — Postgres still enforces it, this is just a
  // TypeScript-level convenience we're giving up to unblock drizzle-kit.
  supplierId: uuid("supplier_id"),
  item: text("item").notNull(),
  description: text("description"),
  category: text("category"),
  supplierName: text("supplier_name").notNull(),
  supplierType: text("supplier_type"),
  unitPrice: integer("unit_price").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  dispatchStatus: text("dispatch_status").default("Dispatch ready"),
  shippingCost: integer("shipping_cost").notNull().default(0),
  moq: integer("moq").notNull().default(1),
  quantityAvailable: integer("quantity_available").notNull(),
  aiScore: integer("ai_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});