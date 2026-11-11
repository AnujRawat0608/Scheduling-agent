import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOrders, supplierOrderItems } from "../db/suppliersSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class OutOfStockError extends Error {
  constructor(public itemName: string) {
    super(`Not enough stock for "${itemName}"`);
  }
}

/** Takes stock for every line. Throws OutOfStockError, which rolls the whole transaction back. */
export async function reserveStock(
  tx: Tx,
  items: { productId: string; quantity: number; itemName: string }[]
) {
  // Fixed order, so two orders with overlapping products can't deadlock each other.
  const sorted = [...items].sort((a, b) => a.productId.localeCompare(b.productId));

  for (const { productId, quantity, itemName } of sorted) {
    const updated = await tx
      .update(supplierOffers)
      .set({
        quantityAvailable: sql`${supplierOffers.quantityAvailable} - ${quantity}`,
        updatedAt: new Date(),
      })
      .where(and(eq(supplierOffers.id, productId), gte(supplierOffers.quantityAvailable, quantity)))
      .returning({ id: supplierOffers.id });

    if (updated.length === 0) throw new OutOfStockError(itemName);
  }
}

/**
 * Moves an order to "cancelled" and puts its stock back, in one transaction.
 * `guard` says who may cancel it (the buyer's email, the supplier's id, etc.).
 * Returns null if the order doesn't match or isn't pending, so a repeated
 * cancel can never restock twice.
 */
export async function cancelPendingOrder(orderId: string, guard: ReturnType<typeof eq>) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .update(supplierOrders)
      .set({ status: "cancelled" })
      .where(and(eq(supplierOrders.id, orderId), eq(supplierOrders.status, "pending"), guard))
      .returning();
    if (!order) return null;

    // Orders created before this fix never took stock, so don't give any back.
    if (order.stockReserved) {
      const items = await tx
        .select()
        .from(supplierOrderItems)
        .where(eq(supplierOrderItems.orderId, order.id));
   for (const i of items) {
  // The product may have been deleted since the order was placed; nothing to restock then.
  if (!i.productId) continue;

  await tx
    .update(supplierOffers)
    .set({
      quantityAvailable: sql`${supplierOffers.quantityAvailable} + ${i.quantity}`,
      updatedAt: new Date(),
    })
    .where(eq(supplierOffers.id, i.productId));
}
    }
    return order;
  });
}