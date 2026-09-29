import { Router } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOrders, supplierOrderItems } from "../db/suppliersSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";

export const supplierOrdersRouter = Router();

/**
 * Computes subtotal and tax amount for a line item, given the product's
 * declared tax settings. taxInclusive means unitPrice already contains
 * the tax (so it's extracted, not added); otherwise tax is added on top.
 * Values are in the same unit as unitPrice (e.g. whole rupees/cents).
 */
function computeTax(
  unitPrice: number,
  quantity: number,
  taxRate: number | null,
  taxInclusive: boolean
): { subtotal: number; taxAmount: number } {
  const gross = unitPrice * quantity;
  if (!taxRate) {
    return { subtotal: gross, taxAmount: 0 };
  }
  if (taxInclusive) {
    const subtotal = Math.round(gross / (1 + taxRate / 100));
    return { subtotal, taxAmount: gross - subtotal };
  }
  const taxAmount = Math.round(gross * (taxRate / 100));
  return { subtotal: gross, taxAmount };
}

/**
 * Attaches each order's line items, grouped in one extra query rather
 * than N+1 queries per order.
 */
async function attachItems<T extends { id: string }>(
  orders: T[]
): Promise<(T & { items: (typeof supplierOrderItems.$inferSelect)[] })[]> {
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select()
    .from(supplierOrderItems)
    .where(inArray(supplierOrderItems.orderId, orderIds));

  const itemsByOrder = new Map<string, (typeof supplierOrderItems.$inferSelect)[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));
}

/**
 * POST /api/supplier-orders
 * Buyer-facing: place a direct order against a supplier, containing one
 * or more line items (cart checkout). Tax is computed per item (each
 * item's own productId, if given) and rolled up into the order's
 * subtotal/taxAmount/total.
 */
supplierOrdersRouter.post("/supplier-orders", async (req, res) => {
  try {
    const {
      supplierId,
      items,
      deliveryAddress,
      requesterName,
      requesterEmail,
      notes,
    } = req.body ?? {};

    if (
      !supplierId ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !deliveryAddress ||
      !requesterName ||
      !requesterEmail
    ) {
      return res.status(400).json({
        error:
          "supplierId, a non-empty items array, deliveryAddress, requesterName, and requesterEmail are required",
      });
    }

    for (const item of items) {
      if (!item.itemName || !item.quantity) {
        return res.status(400).json({
          error: "Each item requires itemName and quantity",
        });
      }
    }

    // Look up tax settings for every item that has a productId, in one
    // query rather than one per item.
    const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))];
    const products = productIds.length
      ? await db
          .select({
            id: supplierOffers.id,
            taxType: supplierOffers.taxType,
            taxRate: supplierOffers.taxRate,
            taxInclusive: supplierOffers.taxInclusive,
            shippingCost: supplierOffers.shippingCost,
          })
          .from(supplierOffers)
          .where(inArray(supplierOffers.id, productIds))
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    let orderSubtotal = 0;
    let orderTaxAmount = 0;
    let orderShippingCost: number | null = null;

    const itemsToInsert = items.map((item: any) => {
      let taxType: string | null = null;
      let taxRate: number | null = null;
      let taxInclusive = false;
      let subtotal: number | null = null;
      let taxAmount: number | null = null;

      if (item.productId && item.unitPrice != null) {
        const product = productById.get(item.productId);
        if (product) {
          taxType = product.taxType;
          taxRate = product.taxRate !== null ? Number(product.taxRate) : null;
          taxInclusive = product.taxInclusive;
          if (orderShippingCost === null && product.shippingCost != null) {
            orderShippingCost = product.shippingCost;
          }

          const computed = computeTax(item.unitPrice, item.quantity, taxRate, taxInclusive);
          subtotal = computed.subtotal;
          taxAmount = computed.taxAmount;
        }
      }

      if (subtotal !== null) orderSubtotal += subtotal;
      if (taxAmount !== null) orderTaxAmount += taxAmount;

      return {
        productId: item.productId ?? null,
        itemName: item.itemName,
        unitPrice: item.unitPrice ?? null,
        quantity: item.quantity,
        taxType,
        taxRate: taxRate !== null ? String(taxRate) : null,
        taxInclusive,
        subtotal,
        taxAmount,
      };
    });

    const total = orderSubtotal + orderTaxAmount + (orderShippingCost ?? 0);

    const [order] = await db
      .insert(supplierOrders)
      .values({
        supplierId,
        deliveryAddress,
        requesterName,
        requesterEmail,
        notes: notes ?? null,
        subtotal: orderSubtotal || null,
        taxAmount: orderTaxAmount || null,
        shippingCost: orderShippingCost,
        total: total || null,
      })
      .returning();

    const insertedItems = await db
      .insert(supplierOrderItems)
      .values(itemsToInsert.map((item) => ({ ...item, orderId: order.id })))
      .returning();

    res.status(201).json({ order: { ...order, items: insertedItems } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * GET /api/supplier-orders
 * Billing-facing: all orders, newest first, with their line items.
 */
supplierOrdersRouter.get("/supplier-orders", async (_req, res) => {
  const orders = await db
    .select()
    .from(supplierOrders)
    .orderBy(desc(supplierOrders.createdAt));

  res.json({ orders: await attachItems(orders) });
});

/**
 * GET /api/supplier-orders/mine
 * Supplier-facing: orders placed against the logged-in supplier's account.
 */
supplierOrdersRouter.get("/supplier-orders/mine", requireSupplierAuth, async (req, res) => {
  const orders = await db
    .select()
    .from(supplierOrders)
    .where(eq(supplierOrders.supplierId, req.supplier!.supplierId))
    .orderBy(desc(supplierOrders.createdAt));

  res.json({ orders: await attachItems(orders) });
});

/**
 * PATCH /api/supplier-orders/:id/confirm
 * Marks an order as confirmed. No auth for now — same pattern as the
 * rest of this router until buyer accounts exist.
 */
supplierOrdersRouter.patch("/supplier-orders/:id/confirm", async (req, res) => {
  try {
    const [order] = await db
      .update(supplierOrders)
      .set({ status: "confirmed" })
      .where(eq(supplierOrders.id, req.params.id))
      .returning();

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = await db
      .select()
      .from(supplierOrderItems)
      .where(eq(supplierOrderItems.orderId, order.id));

    res.json({ order: { ...order, items } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});