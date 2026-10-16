import crypto from "crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import Razorpay from "razorpay";
import { db } from "../db/client.js";
import { supplierOrders } from "../db/suppliersSchema.js";

/**
 * Payments for supplier orders.
 *
 *   PAYMENT_MODE=demo       no gateway, no keys: the order is confirmed without any payment.
 *                           Ignored when NODE_ENV=production.
 *   PAYMENT_MODE=razorpay   real Razorpay (use rzp_test_ keys while developing).
 *                           Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
 *
 * The amount charged is always the order's server-side `total` (goods + tax + shipping),
 * never a number sent from the browser. The order only becomes "confirmed" here, after
 * the payment has been verified.
 */
export const paymentsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Demo mode never runs in production, even if the env var is left on by mistake. */
const isDemo = () => process.env.PAYMENT_MODE === "demo" && process.env.NODE_ENV !== "production";

// Created lazily so the server starts (in demo mode) without any Razorpay keys.
let razorpayClient: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (!razorpayClient) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay keys are not configured");
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpayClient;
}

async function findOrder(orderId: string) {
  if (!UUID_RE.test(orderId)) return null;
  const [order] = await db.select().from(supplierOrders).where(eq(supplierOrders.id, orderId)).limit(1);
  return order ?? null;
}

/**
 * POST /api/payments/orders/:orderId/session
 * Starts a payment for a pending order.
 */
paymentsRouter.post("/orders/:orderId/session", async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "pending") {
      return res.status(409).json({ error: "This order is already paid or closed" });
    }

    const amount = Math.round(Number(order.total) * 100); // paise / cents
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "This order has no payable amount" });
    }

    if (isDemo()) {
      return res.json({ mode: "demo", amount, currency: order.currency });
    }

    const rzpOrder = await getRazorpay().orders.create({
      amount,
      currency: order.currency, // INR works by default; USD/EUR need international payments enabled in Razorpay
      receipt: order.id,
      notes: { orderId: order.id },
    });

    await db
      .update(supplierOrders)
      .set({ razorpayOrderId: rzpOrder.id })
      .where(eq(supplierOrders.id, order.id));

    res.json({
      mode: "razorpay",
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: rzpOrder.id,
      amount,
      currency: order.currency,
      merchantName: process.env.MERCHANT_NAME ?? "Procurement",
      description: `Order ${order.id.slice(0, 8)}`,
    });
  } catch (err) {
    console.error("Could not start payment", err);
    res.status(500).json({ error: "Couldn't start the payment" });
  }
});

/**
 * POST /api/payments/orders/:orderId/verify
 * Checks the payment, then marks the order confirmed (pending -> confirmed).
 */
paymentsRouter.post("/orders/:orderId/verify", async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Already paid (e.g. the buyer double-clicked or retried): succeed quietly.
    if (order.paidAt) return res.json({ ok: true });
    if (order.status !== "pending") {
      return res.status(409).json({ error: "This order is already closed" });
    }

    let paymentId: string;

    if (isDemo()) {
      paymentId = `demo_${Date.now()}`;
    } else {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
      if (
        typeof razorpay_order_id !== "string" ||
        typeof razorpay_payment_id !== "string" ||
        typeof razorpay_signature !== "string"
      ) {
        return res.status(400).json({ error: "Missing payment details" });
      }
      if (order.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).json({ error: "Payment doesn't match this order" });
      }

      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) throw new Error("Razorpay keys are not configured");

      const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      const valid =
        expected.length === razorpay_signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
      if (!valid) return res.status(400).json({ error: "Payment signature check failed" });

      paymentId = razorpay_payment_id;
    }

    // The status check in WHERE makes this safe if two requests arrive at once.
    const [updated] = await db
      .update(supplierOrders)
      .set({ status: "confirmed", razorpayPaymentId: paymentId, paidAt: new Date() })
      .where(and(eq(supplierOrders.id, order.id), eq(supplierOrders.status, "pending")))
      .returning({ id: supplierOrders.id });

    if (!updated) return res.status(409).json({ error: "This order is already closed" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Could not verify payment", err);
    res.status(500).json({ error: "Couldn't verify the payment" });
  }
});