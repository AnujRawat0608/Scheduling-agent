import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

export const supplierOffers = pgTable("supplier_offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  item: text("item").notNull(),
  supplierName: text("supplier_name").notNull(),
  unitPrice: integer("unit_price").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  shippingCost: integer("shipping_cost").notNull().default(0),
  moq: integer("moq").notNull().default(1),
  quantityAvailable: integer("quantity_available").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});