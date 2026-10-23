import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers, supplierOrders } from "../db/suppliersSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";

export const rfqTaskQuotesRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/rfqs/by-task/:taskId
 * The signed-in buyer's RFQs for one procurement task, each with the supplier's latest quote
 * (null while the supplier hasn't replied) and the order created when the buyer accepted it
 * (null until then). Only RFQs owned by this buyer are returned.
 */
rfqTaskQuotesRouter.get("/:taskId", requireProcurerAuth, async (req, res) => {
  try {
    const taskId = req.params.taskId;
    if (!UUID_RE.test(taskId)) return res.status(404).json({ error: "Task not found" });

    const rows = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.taskId, taskId), eq(rfqs.procurerId, req.procurer!.procurerId)))
      .orderBy(asc(rfqs.createdAt));

    if (rows.length === 0) return res.json({ rfqs: [] });
    const rfqIds = rows.map((r) => r.id);

    // Latest quote per RFQ (a supplier's resubmission replaces the earlier one, but be safe).
    const quoteRows = await db
      .select()
      .from(rfqQuotes)
      .where(inArray(rfqQuotes.rfqId, rfqIds))
      .orderBy(desc(rfqQuotes.createdAt));
    const latestQuote = new Map<string, (typeof quoteRows)[number]>();
    for (const q of quoteRows) if (!latestQuote.has(q.rfqId)) latestQuote.set(q.rfqId, q);

    // The order created from each accepted quote.
    const orderRows = await db
      .select({
        id: supplierOrders.id,
        rfqId: supplierOrders.rfqId,
        status: supplierOrders.status,
        total: supplierOrders.total,
        currency: supplierOrders.currency,
      })
      .from(supplierOrders)
      .where(inArray(supplierOrders.rfqId, rfqIds));
    const orderByRfq = new Map(orderRows.map((o) => [o.rfqId as string, o]));

    const supplierRows = await db
      .select({ id: suppliers.id, businessName: suppliers.businessName })
      .from(suppliers)
      .where(inArray(suppliers.id, [...new Set(rows.map((r) => r.supplierId))]));
    const nameById = new Map(supplierRows.map((s) => [s.id, s.businessName]));

    res.json({
      rfqs: rows.map((r) => {
        const q = latestQuote.get(r.id);
        const o = orderByRfq.get(r.id);
        return {
          id: r.id,
          referenceNumber: r.referenceNumber,
          status: r.status,
          currency: r.currency,
          dueDate: r.dueDate,
          lineItems: r.lineItems ?? [],
          supplier: { id: r.supplierId, businessName: nameById.get(r.supplierId) ?? "Supplier" },
          quote: q
            ? {
                id: q.id,
                currency: q.currency ?? r.currency,
                totalPrice: q.totalPrice == null ? null : Number(q.totalPrice),
                leadTimeDays: q.leadTimeDays,
                validUntil: q.validUntil,
                paymentTerms: q.paymentTerms,
                notes: q.notes,
                lineItemQuotes: q.lineItemQuotes ?? [],
                createdAt: q.createdAt,
              }
            : null,
          order: o
            ? { id: o.id, status: o.status, total: o.total == null ? null : Number(o.total), currency: o.currency }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});