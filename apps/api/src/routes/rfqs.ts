import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { sendMail, buildRfqNotificationEmail } from "../agent/lib/mailer.js";

export const rfqRouter = Router();

/**
 * POST /api/rfqs
 * A procurer sends (or drafts) an RFQ to a specific supplier.
 *
 * NOTE: no buyer/procurement login system yet — same gap as elsewhere in
 * this codebase. requesterName/requesterEmail are trusted as submitted by
 * the form rather than derived from a session.
 */
rfqRouter.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
    const { supplierId, referenceNumber, requesterName, requesterEmail } = body;

    if (!supplierId || !referenceNumber || !requesterName || !requesterEmail) {
      return res.status(400).json({
        error: "supplierId, referenceNumber, requesterName, and requesterEmail are required",
      });
    }

    const [supplier] = await db
      .select({ id: suppliers.id, email: suppliers.email, businessName: suppliers.businessName })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const status = body.status === "draft" ? "draft" : "sent";

    const [rfq] = await db
      .insert(rfqs)
      .values({
        supplierId,
        referenceNumber,
        requesterName,
        requesterEmail,
        status,
        currency: body.currency ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        priceValidUntil: body.priceValidUntil ? new Date(body.priceValidUntil) : null,
        lineItems: body.lineItems ?? [],
        scopeNotes: body.scopeNotes ?? null,
        assumptionsExclusions: body.assumptionsExclusions ?? null,
        paymentTerms: body.paymentTerms ?? null,
        deliveryAddress: body.deliveryAddress ?? null,
        requiredDeliveryDate: body.requiredDeliveryDate ? new Date(body.requiredDeliveryDate) : null,
        incoterm: body.incoterm ?? null,
        packagingRequirements: body.packagingRequirements ?? null,
        warrantyPeriod: body.warrantyPeriod ?? null,
        qualityRequirements: body.qualityRequirements ?? null,
        requiredCertifications: body.requiredCertifications ?? null,
        insuranceRequired: body.insuranceRequired ?? false,
        technicalDocumentNames: body.technicalDocumentNames ?? [],
        notes: body.notes ?? null,
      })
      .returning();

    // Only notify on an actual send — drafts stay silent.
    if (status === "sent") {
      try {
        const { subject, html, text } = buildRfqNotificationEmail({
          referenceNumber: rfq.referenceNumber,
          requesterName: rfq.requesterName,
          requesterEmail: rfq.requesterEmail,
          dueDate: rfq.dueDate,
          currency: rfq.currency,
          lineItems: (rfq.lineItems as { productName: string; specification?: string | null; unit?: string | null; quantity: number }[]) ?? [],
        });
        await sendMail({ to: supplier.email, subject, html, text });
      } catch (mailErr) {
        // The RFQ is already saved and will still show up in-app even if
        // the email fails to send — don't fail the whole request over it.
        console.error(`Failed to send RFQ email for ${rfq.id}:`, mailErr);
      }
    }

    res.status(201).json({ rfq });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * GET /api/rfqs/:id
 * Procurer-facing: fetch a single RFQ (the one they just sent) along with
 * the supplier's quote, if one has come in yet. No auth — same "no buyer
 * login system yet" gap as supplier-orders' GET all. Sits below /me in
 * this router so it doesn't shadow the supplier-auth routes, which are
 * registered first.
 */
rfqRouter.get("/:id", async (req, res) => {
  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, req.params.id)).limit(1);

  if (!rfq) {
    return res.status(404).json({ error: "RFQ not found" });
  }

  const [supplier] = await db
    .select({ id: suppliers.id, businessName: suppliers.businessName, contactName: suppliers.contactName })
    .from(suppliers)
    .where(eq(suppliers.id, rfq.supplierId))
    .limit(1);

  const quotes = await db.select().from(rfqQuotes).where(eq(rfqQuotes.rfqId, rfq.id)).orderBy(desc(rfqQuotes.createdAt));

  res.json({ rfq: { ...rfq, supplier: supplier ?? null, quotes } });
});

/**
 * GET /api/rfqs/me
 * The logged-in supplier's own incoming RFQs, newest first.
 */
rfqRouter.get("/me", requireSupplierAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(rfqs)
    .where(eq(rfqs.supplierId, req.supplier!.supplierId))
    .orderBy(desc(rfqs.createdAt));

  res.json({ rfqs: rows });
});

/**
 * GET /api/rfqs/me/unread-count
 * For a notification badge in the supplier nav/dashboard.
 */
rfqRouter.get("/me/unread-count", requireSupplierAuth, async (req, res) => {
  const rows = await db
    .select({ id: rfqs.id })
    .from(rfqs)
    .where(and(eq(rfqs.supplierId, req.supplier!.supplierId), eq(rfqs.isRead, false)));

  res.json({ count: rows.length });
});

/**
 * GET /api/rfqs/me/:id
 * A single RFQ's full detail. Marks it read as a side effect of opening it.
 */
rfqRouter.get("/me/:id", requireSupplierAuth, async (req, res) => {
  const [rfq] = await db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.id, req.params.id), eq(rfqs.supplierId, req.supplier!.supplierId)))
    .limit(1);

  if (!rfq) {
    return res.status(404).json({ error: "RFQ not found" });
  }

  if (!rfq.isRead) {
    await db.update(rfqs).set({ isRead: true, updatedAt: new Date() }).where(eq(rfqs.id, rfq.id));
    rfq.isRead = true;
  }

  res.json({ rfq });
});

/**
 * POST /api/rfqs/me/:id/quote
 * Supplier-facing: submit a quote in response to an RFQ they received.
 * One quote per RFQ for now (matches rfqs' single-supplier model) — a
 * resubmission overwrites the previous quote rather than creating a
 * second row, since a supplier revising their price before the procurer
 * has acted on it is the common case, not a new competing bid.
 */
rfqRouter.post("/me/:id/quote", requireSupplierAuth, async (req, res) => {
  try {
    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.id, req.params.id), eq(rfqs.supplierId, req.supplier!.supplierId)))
      .limit(1);

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    const body = req.body ?? {};
    if (!Array.isArray(body.lineItemQuotes) || body.lineItemQuotes.length === 0) {
      return res.status(400).json({ error: "lineItemQuotes is required and must be non-empty" });
    }

    const totalPrice = body.lineItemQuotes.reduce(
      (sum: number, li: { lineTotal?: number }) => sum + (li.lineTotal ?? 0),
      0
    );

    // Overwrite any existing quote for this RFQ rather than stacking rows.
    await db.delete(rfqQuotes).where(eq(rfqQuotes.rfqId, rfq.id));

    const [quote] = await db
      .insert(rfqQuotes)
      .values({
        rfqId: rfq.id,
        supplierId: req.supplier!.supplierId,
        currency: body.currency ?? rfq.currency ?? null,
        totalPrice: totalPrice || null,
        leadTimeDays: body.leadTimeDays ?? null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        paymentTerms: body.paymentTerms ?? null,
        notes: body.notes ?? null,
        lineItemQuotes: body.lineItemQuotes,
      })
      .returning();

    await db.update(rfqs).set({ status: "quoted", updatedAt: new Date() }).where(eq(rfqs.id, rfq.id));

    res.status(201).json({ quote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});