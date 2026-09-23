import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOrders } from "../db/suppliersSchema.js";
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
 * POST /api/supplier-orders
 * Buyer-facing: place a direct order against a supplier's listing.
 * If productId is given, tax settings are pulled from that product and
 * snapshotted onto the order — never recalculated later even if the
 * product's tax settings change afterward.
 */
supplierOrdersRouter.post("/supplier-orders", async (req, res) => {
  try {
    const {
      supplierId,
      productId,
      itemName,
      unitPrice,
      quantity,
      deliveryAddress,
      requesterName,
      requesterEmail,
      notes,
    } = req.body ?? {};

    if (!supplierId || !itemName || !quantity || !deliveryAddress || !requesterName || !requesterEmail) {
      return res.status(400).json({
        error: "supplierId, itemName, quantity, deliveryAddress, requesterName, and requesterEmail are required",
      });
    }

    let taxType: string | null = null;
    let taxRate: number | null = null;
    let taxInclusive = false;
    let subtotal: number | null = null;
    let taxAmount: number | null = null;

    if (productId && unitPrice != null) {
      const [product] = await db
        .select({
          taxType: supplierOffers.taxType,
          taxRate: supplierOffers.taxRate,
          taxInclusive: supplierOffers.taxInclusive,
        })
        .from(supplierOffers)
        .where(eq(supplierOffers.id, productId))
        .limit(1);

      if (product) {
        taxType = product.taxType;
        taxRate = product.taxRate !== null ? Number(product.taxRate) : null;
        taxInclusive = product.taxInclusive;

        const computed = computeTax(unitPrice, quantity, taxRate, taxInclusive);
        subtotal = computed.subtotal;
        taxAmount = computed.taxAmount;
      }
    }

   const [order] = await db
  .insert(supplierOrders)
  .values({
    supplierId,
    productId: productId ?? null,
    itemName,
    unitPrice: unitPrice ?? null,
    quantity,
    deliveryAddress,
    requesterName,
    requesterEmail,
    notes: notes ?? null,
    taxType,
    taxRate: taxRate !== null ? String(taxRate) : null,
    taxInclusive,
    subtotal,
    taxAmount,
  })
  .returning();

    res.status(201).json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * GET /api/supplier-orders
 * Billing-facing: all orders, newest first. No auth — mirrors how
 * procurementTasks are listed today (no buyer login system yet).
 */
supplierOrdersRouter.get("/supplier-orders", async (_req, res) => {
  const orders = await db
    .select()
    .from(supplierOrders)
    .orderBy(desc(supplierOrders.createdAt));

  res.json({ orders });
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

  res.json({ orders });
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

    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});