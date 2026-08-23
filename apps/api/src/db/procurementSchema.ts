import { pgTable, uuid, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

export const procurementTasks = pgTable("procurement_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  requesterEmail: text("requester_email").notNull(),
  item: text("item").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("extracting"),
  request: jsonb("request").notNull(),
  recommendedSupplier: jsonb("recommended_supplier"),
  totalCost: integer("total_cost"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
