import { Router } from "express";
import { eq, and, ne, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { sendMail, buildRfqNotificationEmail } from "../agent/lib/mailer.js";

export const rfqRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Simple in-memory limit for creating RFQs: 20 per IP per hour.
// (Resets when the server restarts; use Redis or similar if you need it strict, and set
// app.set("trust proxy", 1) if the API runs behind a proxy so req.ip is the real client.)
const createHits = new Map<string, number[]>();
function createRateLimited(ip: string) {
  const now = Date.now();
  const recent = (createHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 20) return true;
  createHits.set(ip, [...recent, now]);
  if (createHits.size > 5000) {
    for (const [key, times] of createHits) {
      if (times.every((t) => now - t >= 60 * 60 * 1000)) createHits.delete(key);
    }
  }
  return false;
}

/** Optional date field: empty is fine (null), garbage is reported as invalid. */
function parseDate(value: unknown): { value: Date | null; valid: boolean } {
  if (value === undefined || value === null || value === "") return { value: null, valid: true };
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? { value: null, valid: false } : { value: d, valid: true };
}

const fail500 = (res: import("express").Response, err: unknown) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
};

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
    if (createRateLimited(req.ip ?? "unknown")) {
      return res.status(429).json({ error: "Too many RFQs. Please try again later." });
    }

    const body = req.body ?? {};
    const { supplierId, referenceNumber, requesterName, requesterEmail } = body;

    if (!supplierId || !referenceNumber || !requesterName || !requesterEmail) {
      return res.status(400).json({
        error: "supplierId, referenceNumber, requesterName, and requesterEmail are required",
      });
    }
    if (typeof supplierId !== "string" || !UUID_RE.test(supplierId)) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    if (
      typeof referenceNumber !== "string" || referenceNumber.length > 100 ||
      typeof requesterName !== "string" || requesterName.length > 200 ||
      typeof requesterEmail !== "string" || requesterEmail.length > 200
    ) {
      return res.status(400).json({ error: "referenceNumber, requesterName or requesterEmail is invalid" });
    }

    const lineItems = body.lineItems ?? [];
    if (
      !Array.isArray(lineItems) ||
      lineItems.length > 200 ||
      lineItems.some(
        (li: { productName?: unknown; quantity?: unknown }) =>
          !li || typeof li.productName !== "string" || !Number.isFinite(li.quantity) || (li.quantity as number) <= 0
      )
    ) {
      return res.status(400).json({
        error: "lineItems must be a list of { productName, quantity } with a positive quantity",
      });
    }

    const dueDate = parseDate(body.dueDate);
    const priceValidUntil = parseDate(body.priceValidUntil);
    const requiredDeliveryDate = parseDate(body.requiredDeliveryDate);
    if (!dueDate.valid || !priceValidUntil.valid || !requiredDeliveryDate.valid) {
      return res.status(400).json({ error: "One of the dates is not a valid date" });
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
        dueDate: dueDate.value,
        priceValidUntil: priceValidUntil.value,
        lineItems,
        scopeNotes: body.scopeNotes ?? null,
        assumptionsExclusions: body.assumptionsExclusions ?? null,
        paymentTerms: body.paymentTerms ?? null,
        deliveryAddress: body.deliveryAddress ?? null,
        requiredDeliveryDate: requiredDeliveryDate.value,
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
    if (status === "sent" && supplier.email) {
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
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/me
 * The logged-in supplier's own incoming RFQs, newest first. Drafts are not shown:
 * a draft hasn't been sent to the supplier yet.
 *
 * NOTE: the /me routes must stay ABOVE /:id, otherwise "me" is matched as an RFQ id.
 */
rfqRouter.get("/me", requireSupplierAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.supplierId, req.supplier!.supplierId), ne(rfqs.status, "draft")))
      .orderBy(desc(rfqs.createdAt));

    res.json({ rfqs: rows });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/me/unread-count
 * For a notification badge in the supplier nav/dashboard.
 */
rfqRouter.get("/me/unread-count", requireSupplierAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ id: rfqs.id })
      .from(rfqs)
      .where(
        and(eq(rfqs.supplierId, req.supplier!.supplierId), eq(rfqs.isRead, false), ne(rfqs.status, "draft"))
      );

    res.json({ count: rows.length });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/me/:id
 * A single RFQ's full detail. Marks it read as a side effect of opening it.
 */
rfqRouter.get("/me/:id", requireSupplierAuth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "RFQ not found" });

    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, req.params.id),
          eq(rfqs.supplierId, req.supplier!.supplierId),
          ne(rfqs.status, "draft")
        )
      )
      .limit(1);

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    if (!rfq.isRead) {
      await db.update(rfqs).set({ isRead: true, updatedAt: new Date() }).where(eq(rfqs.id, rfq.id));
      rfq.isRead = true;
    }

    res.json({ rfq });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * POST /api/rfqs/me/:id/quote
 * Supplier-facing: submit a quote in response to an RFQ they received.
 * One quote per RFQ for now (matches rfqs' single-supplier model) — a
 * resubmission replaces the previous quote rather than creating a
 * second row, since a supplier revising their price before the procurer
 * has acted on it is the common case, not a new competing bid.
 */
rfqRouter.post("/me/:id/quote", requireSupplierAuth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "RFQ not found" });

    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, req.params.id),
          eq(rfqs.supplierId, req.supplier!.supplierId),
          ne(rfqs.status, "draft")
        )
      )
      .limit(1);

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    const body = req.body ?? {};
    if (!Array.isArray(body.lineItemQuotes) || body.lineItemQuotes.length === 0) {
      return res.status(400).json({ error: "lineItemQuotes is required and must be non-empty" });
    }
    if (body.lineItemQuotes.length > 200) {
      return res.status(400).json({ error: "Too many line items" });
    }
    for (const li of body.lineItemQuotes as { lineTotal?: unknown }[]) {
      if (li?.lineTotal !== undefined && (!Number.isFinite(li.lineTotal) || (li.lineTotal as number) < 0)) {
        return res.status(400).json({ error: "lineTotal must be a non-negative number" });
      }
    }
    if (
      body.leadTimeDays !== undefined &&
      body.leadTimeDays !== null &&
      (!Number.isInteger(body.leadTimeDays) || body.leadTimeDays < 0)
    ) {
      return res.status(400).json({ error: "leadTimeDays must be a non-negative whole number" });
    }
    const validUntil = parseDate(body.validUntil);
    if (!validUntil.valid) {
      return res.status(400).json({ error: "validUntil is not a valid date" });
    }

    const totalPrice = body.lineItemQuotes.reduce(
      (sum: number, li: { lineTotal?: number }) => sum + (li.lineTotal ?? 0),
      0
    );

    // Insert the new quote FIRST, then remove older ones. If anything fails in between,
    // the supplier ends up with two quotes at worst, never with none.
    const [quote] = await db
      .insert(rfqQuotes)
      .values({
        rfqId: rfq.id,
        supplierId: req.supplier!.supplierId,
        currency: body.currency ?? rfq.currency ?? null,
        totalPrice: totalPrice || null,
        leadTimeDays: body.leadTimeDays ?? null,
        validUntil: validUntil.value,
        paymentTerms: body.paymentTerms ?? null,
        notes: body.notes ?? null,
        lineItemQuotes: body.lineItemQuotes,
      })
      .returning();

    await db.delete(rfqQuotes).where(and(eq(rfqQuotes.rfqId, rfq.id), ne(rfqQuotes.id, quote.id)));

    await db.update(rfqs).set({ status: "quoted", updatedAt: new Date() }).where(eq(rfqs.id, rfq.id));

    res.status(201).json({ quote });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/:id
 * Procurer-facing: fetch a single RFQ (the one they just sent) along with
 * the supplier's quote, if one has come in yet. No auth — same "no buyer
 * login system yet" gap as supplier-orders' GET all, so anyone who has the
 * RFQ's id can read it. Add buyer auth before real use.
 *
 * Registered LAST so it can't shadow the /me routes above.
 */
rfqRouter.get("/:id", async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "RFQ not found" });

    const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, req.params.id)).limit(1);

    if (!rfq) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    const [supplier] = await db
      .select({ id: suppliers.id, businessName: suppliers.businessName, contactName: suppliers.contactName })
      .from(suppliers)
      .where(eq(suppliers.id, rfq.supplierId))
      .limit(1);

    const quotes = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id))
      .orderBy(desc(rfqQuotes.createdAt));

    res.json({ rfq: { ...rfq, supplier: supplier ?? null, quotes } });
  } catch (err) {
    fail500(res, err);
  }
});