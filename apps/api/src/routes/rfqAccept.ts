import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers, supplierOrders, supplierOrderItems } from "../db/suppliersSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";
import { sendMailBounded } from "../agent/lib/mailSafe.js";

export const rfqAcceptRouter = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type QuoteLine = { productName?: string; quantity?: number; unitPrice?: number };
type RfqLine = { productName?: string; quantity?: number };

/**
 * POST /api/rfq-orders/:rfqId/accept
 * The signed-in buyer accepts the supplier's quote for one of THEIR RFQs. The server:
 *   1. checks the RFQ belongs to this buyer and is in "quoted" status,
 *   2. checks the quote the buyer saw (quoteId) is still the supplier's current quote,
 *   3. creates a normal "pending" order from the QUOTE's prices (never from the browser),
 *   4. marks the RFQ "accepted" so the quote can't be accepted twice or changed.
 * All of it happens in one transaction: either everything is saved or nothing is.
 *
 * Body: { quoteId, deliveryAddress, notes? }
 */
rfqAcceptRouter.post("/:rfqId/accept", requireProcurerAuth, async (req, res) => {
  try {
    const rfqId = req.params.rfqId;
    if (!UUID_RE.test(rfqId)) throw new HttpError(404, "RFQ not found");

    const { quoteId, deliveryAddress, notes } = req.body ?? {};
    if (typeof quoteId !== "string" || !UUID_RE.test(quoteId)) {
      throw new HttpError(400, "quoteId is required");
    }
    if (
      typeof deliveryAddress !== "string" ||
      deliveryAddress.trim().length < 5 ||
      deliveryAddress.trim().length > 500
    ) {
      throw new HttpError(400, "A delivery address is required (5 to 500 characters)");
    }
    const buyerNotes = typeof notes === "string" ? notes.trim().slice(0, 1000) : "";

    const procurer = req.procurer!;

    // Only the buyer who owns this RFQ can accept its quote.
    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.id, rfqId), eq(rfqs.procurerId, procurer.procurerId)))
      .limit(1);
    if (!rfq) throw new HttpError(404, "RFQ not found");
    if (rfq.status === "accepted") throw new HttpError(409, "This quote has already been accepted");
    if (rfq.status !== "quoted") throw new HttpError(409, "The supplier hasn't sent a quote yet");

    const [quote] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id))
      .orderBy(desc(rfqQuotes.createdAt))
      .limit(1);
    if (!quote) throw new HttpError(409, "The supplier hasn't sent a quote yet");

    // The buyer must be accepting the quote they actually looked at.
    if (quote.id !== quoteId) {
      throw new HttpError(409, "The supplier updated their quote. Please review the latest quote.");
    }

    // A quote is valid through the end of its "valid until" day.
    if (quote.validUntil && quote.validUntil.getTime() + 24 * 60 * 60 * 1000 < Date.now()) {
      throw new HttpError(409, "This quote has expired. Ask the supplier for a new one.");
    }

    // Order lines come from the stored quote. Money is handled in integer cents.
    const quoteLines = (Array.isArray(quote.lineItemQuotes) ? quote.lineItemQuotes : []) as QuoteLine[];
    const rfqLines = (Array.isArray(rfq.lineItems) ? rfq.lineItems : []) as RfqLine[];
    if (quoteLines.length === 0) throw new HttpError(409, "This quote has no line items");

    let subtotalC = 0;
    const items = quoteLines.map((li, i) => {
      const unit = Number(li.unitPrice);
      const qty = Number(li.quantity ?? rfqLines[i]?.quantity);
      if (!Number.isFinite(unit) || unit < 0 || unit >= 10_000_000) {
        throw new HttpError(409, "This quote has an invalid price");
      }
      if (!Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) {
        throw new HttpError(409, "This quote has an invalid quantity");
      }
      const unitC = Math.round(unit * 100);
      const lineC = unitC * qty;
      subtotalC += lineC;
      return {
        itemName: String(li.productName ?? rfqLines[i]?.productName ?? `Item ${i + 1}`).slice(0, 200),
        unitPrice: (unitC / 100).toFixed(2),
        quantity: qty,
        subtotal: (lineC / 100).toFixed(2),
      };
    });
    if (subtotalC <= 0) throw new HttpError(409, "The quote total is zero");

    const currency = quote.currency ?? rfq.currency;
    if (!currency) throw new HttpError(409, "This quote has no currency");

    const orderNotes =
      `Accepted quote for RFQ ${rfq.referenceNumber}.` +
      (quote.leadTimeDays != null ? ` Supplier lead time: ${quote.leadTimeDays} days.` : "") +
      (buyerNotes ? ` Buyer notes: ${buyerNotes}` : "");

    const created = await db.transaction(async (tx) => {
      // Claim the RFQ first: only one request can move it from "quoted" to "accepted".
      const claimed = await tx
        .update(rfqs)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(and(eq(rfqs.id, rfq.id), eq(rfqs.status, "quoted")))
        .returning({ id: rfqs.id });
      if (claimed.length === 0) throw new HttpError(409, "This quote has already been accepted");

      const [order] = await tx
        .insert(supplierOrders)
        .values({
          supplierId: rfq.supplierId,
          rfqId: rfq.id,
          deliveryAddress: deliveryAddress.trim(),
          requesterName: rfq.requesterName,
          requesterEmail: procurer.email,
          notes: orderNotes,
          currency,
          subtotal: (subtotalC / 100).toFixed(2),
          taxAmount: "0.00",
          shippingCost: "0.00",
          total: (subtotalC / 100).toFixed(2),
        })
        .returning();

      await tx.insert(supplierOrderItems).values(
        items.map((it) => ({
          ...it,
          orderId: order.id,
          productId: null,
          taxType: null,
          taxRate: null,
          taxInclusive: false,
          taxAmount: "0.00",
        }))
      );

      return order;
    });

    res.status(201).json({
      order: {
        id: created.id,
        status: created.status,
        total: Number(created.total),
        currency: created.currency,
      },
    });

    // After responding: tell the supplier. A mail failure never undoes the order.
    void notifySupplier({
      supplierId: rfq.supplierId,
      referenceNumber: rfq.referenceNumber,
      orderId: created.id,
      buyerName: rfq.requesterName,
      buyerEmail: procurer.email,
      deliveryAddress: deliveryAddress.trim(),
      currency,
      totalC: subtotalC,
      items,
    });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "This quote has already been accepted" });
    }
    console.error(err);
    res.status(500).json({ error: "Could not accept the quote" });
  }
});

async function notifySupplier(a: {
  supplierId: string;
  referenceNumber: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  deliveryAddress: string;
  currency: string;
  totalC: number;
  items: { itemName: string; unitPrice: string; quantity: number }[];
}) {
  try {
    const [supplier] = await db
      .select({ email: suppliers.email })
      .from(suppliers)
      .where(eq(suppliers.id, a.supplierId))
      .limit(1);
    if (!supplier?.email) return;

    const total = `${a.currency} ${(a.totalC / 100).toFixed(2)}`;
    const rows = a.items
      .map(
        (it) =>
          `<tr>
             <td style="padding:6px 10px;border:1px solid #e5e5e5;">${escapeHtml(it.itemName)}</td>
             <td style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">${it.quantity}</td>
             <td style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">${escapeHtml(a.currency)} ${escapeHtml(it.unitPrice)}</td>
           </tr>`
      )
      .join("");

    const subject = `Quote accepted: ${a.referenceNumber}`;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#f97316;">Your quote was accepted</h2>
        <p><strong>${escapeHtml(a.buyerName)}</strong> accepted your quote for RFQ
           <strong>${escapeHtml(a.referenceNumber)}</strong>. An order has been created.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:left;">Item</th>
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">Qty</th>
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">Unit price</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p><strong>Order total:</strong> ${escapeHtml(total)}</p>
        <p><strong>Deliver to:</strong> ${escapeHtml(a.deliveryAddress)}</p>
        <p style="margin-top:24px;">Log in to your supplier dashboard to see the order.</p>
        <p style="color:#888;font-size:12px;margin-top:32px;">Buyer contact: ${escapeHtml(a.buyerEmail)}</p>
      </div>`;
    const text =
      `Quote accepted: ${a.referenceNumber}\n` +
      `${a.buyerName} accepted your quote. Order total: ${total}\n` +
      `Deliver to: ${a.deliveryAddress}\n` +
      `Log in to your supplier dashboard to see the order.\nBuyer contact: ${a.buyerEmail}`;

    await sendMailBounded({ to: supplier.email, subject, html, text });
  } catch (err) {
    console.error(`Could not notify supplier about accepted quote ${a.referenceNumber}`, err);
  }
}