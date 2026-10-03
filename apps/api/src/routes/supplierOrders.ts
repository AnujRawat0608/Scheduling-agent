import { Router } from "express";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOrders, supplierOrderItems,suppliers } from "../db/suppliersSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { notifyBuyerOrderShipped } from "../lib/orderNotifications.js";

export const supplierOrdersRouter = Router();

type OrderRow = typeof supplierOrders.$inferSelect;
type ItemRow = typeof supplierOrderItems.$inferSelect;

/** Lets handlers answer 400/404 for bad input instead of a generic 500. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 100;
const MAX_QUANTITY = 1_000_000;

// numeric columns come back from Postgres as strings; the web client expects numbers.
const num = (v: string | null): number | null => (v === null ? null : Number(v));

function serializeItem(i: ItemRow) {
  return {
    ...i,
    unitPrice: num(i.unitPrice),
    subtotal: num(i.subtotal),
    taxAmount: num(i.taxAmount),
  };
}

function serializeOrder(o: OrderRow, items: ItemRow[]) {
  return {
    ...o,
    subtotal: num(o.subtotal),
    taxAmount: num(o.taxAmount),
    shippingCost: num(o.shippingCost),
    total: num(o.total),
    items: items.map(serializeItem),
  };
}

/**
 * Attaches each order's line items, grouped in one extra query rather
 * than N+1 queries per order.
 */
async function attachItems(orders: OrderRow[]) {
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const items = await db
    .select()
    .from(supplierOrderItems)
    .where(inArray(supplierOrderItems.orderId, orderIds));

  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  return orders.map((order) => serializeOrder(order, itemsByOrder.get(order.id) ?? []));
}

/**
 * POST /api/supplier-orders
 * Buyer-facing: place a direct order against one supplier, with one or more
 * line items (cart checkout).
 *
 * The client only says WHICH products and HOW MANY. Name, price, currency, tax
 * and shipping are all read from the database here, so the browser can never
 * set its own price. Everything is saved as a snapshot, in one transaction.
 *
 * Money maths is done in integer cents (2-decimal currencies only), then
 * stored as numeric(12,2). No platform fee is added.
 */
supplierOrdersRouter.post("/supplier-orders", async (req, res) => {
  try {
    const { supplierId, items, deliveryAddress, requesterName, requesterEmail, notes } = req.body ?? {};

    const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

    if (
      typeof supplierId !== "string" ||
      !UUID_RE.test(supplierId) ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !nonEmpty(deliveryAddress) ||
      !nonEmpty(requesterName) ||
      !nonEmpty(requesterEmail)
    ) {
      throw new HttpError(
        400,
        "supplierId, a non-empty items array, deliveryAddress, requesterName, and requesterEmail are required"
      );
    }
    if (items.length > MAX_ITEMS) {
      throw new HttpError(400, `An order can have at most ${MAX_ITEMS} items`);
    }

    // Validate each item and merge duplicates of the same product (sum the quantities).
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      const productId = item?.productId;
      const quantity = item?.quantity;
      if (typeof productId !== "string" || !UUID_RE.test(productId)) {
        throw new HttpError(400, "Each item needs a valid productId");
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
        throw new HttpError(400, "Each item needs a positive whole-number quantity");
      }
      qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + quantity);
    }

    // Current price, currency, tax, shipping and stock - straight from the catalog.
    const offers = await db
      .select()
      .from(supplierOffers)
      .where(inArray(supplierOffers.id, [...qtyByProduct.keys()]));
    const offerById = new Map(offers.map((o) => [o.id, o]));

    const currencies = new Set<string>();
    let subtotalC = 0;
    let taxC = 0;
    let shippingC = 0;

    const itemsToInsert = [...qtyByProduct.entries()].map(([productId, quantity]) => {
      const o = offerById.get(productId);
      if (!o) throw new HttpError(400, "One of the products no longer exists");
      if (o.supplierId !== supplierId) {
        throw new HttpError(400, `"${o.item}" does not belong to this supplier`);
      }
      if (quantity < o.moq || quantity > o.quantityAvailable) {
        throw new HttpError(
          400,
          `"${o.item}": quantity must be between ${o.moq} and ${o.quantityAvailable}`
        );
      }

      currencies.add(o.currency);

      const unitCents = Math.round(Number(o.unitPrice) * 100);
      const grossC = unitCents * quantity;
      const rate = o.taxRate == null ? 0 : Number(o.taxRate);

      let netC = grossC;
      let itemTaxC = 0;
      if (rate > 0) {
        if (o.taxInclusive) {
          // Price already contains tax: extract it, don't add it again.
          netC = Math.round(grossC / (1 + rate / 100));
          itemTaxC = grossC - netC;
        } else {
          itemTaxC = Math.round((grossC * rate) / 100);
        }
      }

      subtotalC += netC;
      taxC += itemTaxC;
      // One shipping fee per order: the highest fee among the items wins.
      shippingC = Math.max(shippingC, Math.round(Number(o.shippingCost) * 100));

      return {
        productId: o.id,
        itemName: o.item,
        unitPrice: o.unitPrice, // snapshot of the price at order time (numeric string)
        quantity,
        taxType: o.taxType,
        taxRate: o.taxRate,
        taxInclusive: o.taxInclusive,
        subtotal: (netC / 100).toFixed(2),
        taxAmount: (itemTaxC / 100).toFixed(2),
      };
    });

    if (currencies.size > 1) {
      throw new HttpError(
        400,
        "All items in one order must use the same currency. Place separate orders for different currencies."
      );
    }
    const currency = [...currencies][0];

    const totalC = subtotalC + taxC + shippingC;

    // Order and items are saved together: both succeed or neither does.
    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(supplierOrders)
        .values({
          supplierId,
          deliveryAddress: deliveryAddress.trim(),
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail.trim(),
          notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
          currency,
          subtotal: (subtotalC / 100).toFixed(2),
          taxAmount: (taxC / 100).toFixed(2),
          shippingCost: (shippingC / 100).toFixed(2),
          total: (totalC / 100).toFixed(2),
        })
        .returning();

      const insertedItems = await tx
        .insert(supplierOrderItems)
        .values(itemsToInsert.map((item) => ({ ...item, orderId: order.id })))
        .returning();

      return { order, insertedItems };
    });

    res.status(201).json({ order: serializeOrder(created.order, created.insertedItems) });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Could not place the order" });
  }
});

/**
 * GET /api/supplier-orders
 * Billing-facing: all orders, newest first, with their line items.
 *
 * NOTE: still public because the billing page has no login yet. This returns
 * buyer names, emails and addresses, so lock it down before production.
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
 * Marks an order as confirmed. Only the supplier the order was placed with
 * can confirm it.
 */
supplierOrdersRouter.patch("/supplier-orders/:id/confirm", async (req, res) => {
  try {
    const [order] = await db
      .update(supplierOrders)
      .set({ status: "confirmed" })
      .where(and(eq(supplierOrders.id, req.params.id), eq(supplierOrders.status, "pending")))
      .returning();

    if (!order) {
      return res.status(404).json({ error: "Order not found, or it was already confirmed" });
    }

    const items = await db
      .select()
      .from(supplierOrderItems)
      .where(eq(supplierOrderItems.orderId, order.id));

    res.json({ order: serializeOrder(order, items) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not confirm the order" });
  }
});

/**
 * PATCH /api/supplier-orders/:id/ship
 * Supplier starts shipping an order the buyer has confirmed. Only that supplier can do it,
 * and only from "confirmed", so it can't be repeated or applied to the wrong order.
 */
supplierOrdersRouter.patch("/supplier-orders/:id/ship", requireSupplierAuth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).json({ error: "Order not found" });
    }

    const [order] = await db
      .update(supplierOrders)
      .set({ status: "shipped" })
      .where(
        and(
          eq(supplierOrders.id, req.params.id),
          eq(supplierOrders.supplierId, req.supplier!.supplierId),
          eq(supplierOrders.status, "confirmed")
        )
      )
      .returning();

    // Same answer for "doesn't exist", "not yours" and "not confirmed yet".
    if (!order) {
      return res.status(404).json({ error: "Order not found, or it isn't confirmed yet" });
    }

    const items = await db
      .select()
      .from(supplierOrderItems)
      .where(eq(supplierOrderItems.orderId, order.id));

    const [supplier] = await db
      .select({ businessName: suppliers.businessName })
      .from(suppliers)
      .where(eq(suppliers.id, order.supplierId))
      .limit(1);

    // The order is already shipped at this point; a mail failure must not undo that.
    let notified = false;
    try {
      notified = await notifyBuyerOrderShipped({
        order,
        items,
        supplierName: supplier?.businessName ?? "Your supplier",
      });
    } catch (mailErr) {
      console.error("Failed to notify buyer of shipment", mailErr);
    }

    res.json({ order: serializeOrder(order, items), notified });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not start shipping" });
  }
});