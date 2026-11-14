import { Router } from "express";
import path from "node:path";
import { eq, and, ne, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { rfqAttachments } from "../db/rfqExternalSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";
import { buildRfqNotificationEmail } from "../agent/lib/mailer.js";
import { sendMailBounded } from "../agent/lib/mailSafe.js";
import { createInviteAndEmail } from "../lib/rfqInvites.js";

export const rfqRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same default as routes/rfqAttachments.ts (kept here so this file doesn't depend on multer).
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve("uploads");
type RfqLine = { productName?: string; quantity?: number; unitPrice?: number };
const round2 = (n: number) => Math.round(n * 100) / 100;
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
 * A signed-in buyer sends (or drafts) an RFQ, either to a catalog supplier (supplierType "directory",
 * needs supplierId) or to an external supplier by email (supplierType "external", needs supplierName +
 * supplierEmail). The buyer's login is stored as procurerId: only that buyer can later accept the quote
 * or ask for a revision.
 */
rfqRouter.post("/", requireProcurerAuth, async (req, res) => {
  try {
    if (createRateLimited(req.ip ?? "unknown")) {
      return res.status(429).json({ error: "Too many RFQs. Please try again later." });
    }

    const body = req.body ?? {};
    const external = body.supplierType === "external";
    const { supplierId, referenceNumber, requesterName, requesterEmail } = body;

    if (!referenceNumber || !requesterName || !requesterEmail) {
      return res.status(400).json({
        error: "referenceNumber, requesterName, and requesterEmail are required",
      });
    }
    if (
      typeof referenceNumber !== "string" || referenceNumber.length > 100 ||
      typeof requesterName !== "string" || requesterName.length > 200 ||
      typeof requesterEmail !== "string" || requesterEmail.length > 200
    ) {
      return res.status(400).json({ error: "referenceNumber, requesterName or requesterEmail is invalid" });
    }

    // Who is the RFQ going to?
    let supplier: { id: string; email: string; businessName: string } | null = null;
    let ext = { name: "", email: "", contact: null as string | null, country: null as string | null };

    if (external) {
      ext.name = String(body.supplierName ?? "").trim().slice(0, 200);
      ext.email = String(body.supplierEmail ?? "").trim().toLowerCase().slice(0, 200);
      ext.contact = String(body.supplierContactName ?? "").trim().slice(0, 200) || null;
      ext.country = String(body.supplierCountry ?? "").trim().slice(0, 100) || null;
      if (!ext.name || !EMAIL_RE.test(ext.email)) {
        return res.status(400).json({ error: "External suppliers need a company name and a valid email." });
      }
    } else {
      if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
      if (typeof supplierId !== "string" || !UUID_RE.test(supplierId)) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      // Name and email always come from the database, never from the browser.
      const [s] = await db
        .select({ id: suppliers.id, email: suppliers.email, businessName: suppliers.businessName })
        .from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1);
      if (!s) return res.status(404).json({ error: "Supplier not found" });
      supplier = s;
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

    const status = body.status === "draft" ? "draft" : "sent";

    const [rfq] = await db
      .insert(rfqs)
      .values({
        supplierId: supplier?.id ?? null,
        supplierType: external ? "external" : "directory",
        supplierName: external ? ext.name : supplier!.businessName,
        supplierEmail: external ? ext.email : supplier!.email,
        supplierContactName: external ? ext.contact : null,
        supplierCountry: external ? ext.country : null,
        procurerId: req.procurer!.procurerId,
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
        incotermPlace: body.incotermPlace ?? null,
        packagingRequirements: body.packagingRequirements ?? null,
        warrantyPeriod: body.warrantyPeriod ?? null,
        qualityRequirements: body.qualityRequirements ?? null,
        requiredCertifications: body.requiredCertifications ?? null,
        insuranceRequired: body.insuranceRequired ?? false,
        technicalDocumentNames: body.technicalDocumentNames ?? [],
        notes: body.notes ?? null,
      })
      .returning();

    // Only notify on an actual send; drafts stay silent.
    if (status === "sent" && external) {
      try {
        await createInviteAndEmail(rfq);
      } catch (mailErr) {
        // An external supplier has NO in-app inbox, so a failed email means they'd never see this RFQ.
        console.error(`Failed to send RFQ invite for ${rfq.id}:`, mailErr);
        await db.update(rfqs).set({ status: "draft", updatedAt: new Date() }).where(eq(rfqs.id, rfq.id));
        return res.status(502).json({ error: "RFQ saved as a draft, but the email couldn't be sent. Try again." });
      }
    } else if (status === "sent" && supplier?.email) {
      try {
        const { subject, html, text } = buildRfqNotificationEmail({
          referenceNumber: rfq.referenceNumber,
          requesterName: rfq.requesterName,
          requesterEmail: rfq.requesterEmail,
          dueDate: rfq.dueDate,
          currency: rfq.currency,
          lineItems: (rfq.lineItems as { productName: string; specification?: string | null; unit?: string | null; quantity: number }[]) ?? [],
        });
        await sendMailBounded({ to: supplier.email, subject, html, text });
      } catch (mailErr) {
        // The RFQ is already saved and will still show up in-app even if
        // the email fails to send, so don't fail the whole request over it.
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
 * A single RFQ's full detail, its attached CAD/drawing files and the supplier's latest quote. Marks it read.
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

    const attachments = await db
      .select({ id: rfqAttachments.id, fileName: rfqAttachments.fileName, sizeBytes: rfqAttachments.sizeBytes })
      .from(rfqAttachments)
      .where(eq(rfqAttachments.rfqId, rfq.id));

    // The supplier's own latest quote, so the inbox can show it read-only once it's final.
    const [quote] = await db
      .select()
      .from(rfqQuotes)
      .where(and(eq(rfqQuotes.rfqId, rfq.id), eq(rfqQuotes.supplierId, req.supplier!.supplierId)))
      .orderBy(desc(rfqQuotes.createdAt))
      .limit(1);

    res.json({ rfq, attachments, quote: quote ?? null });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/me/:id/files/:attachmentId
 * The logged-in supplier downloads a CAD/drawing file attached to one of THEIR RFQs.
 */
rfqRouter.get("/me/:id/files/:attachmentId", requireSupplierAuth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.attachmentId)) {
      return res.status(404).json({ error: "File not found" });
    }
    const [rfq] = await db
      .select({ id: rfqs.id })
      .from(rfqs)
      .where(
        and(
          eq(rfqs.id, req.params.id),
          eq(rfqs.supplierId, req.supplier!.supplierId),
          ne(rfqs.status, "draft")
        )
      )
      .limit(1);
    if (!rfq) return res.status(404).json({ error: "File not found" });

    const [file] = await db
      .select()
      .from(rfqAttachments)
      .where(and(eq(rfqAttachments.id, req.params.attachmentId), eq(rfqAttachments.rfqId, rfq.id)))
      .limit(1);
    if (!file) return res.status(404).json({ error: "File not found" });

    res.download(path.join(UPLOAD_ROOT, file.storageKey), file.fileName);
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * POST /api/rfqs/me/:id/quote
 * Supplier-facing: submit a quote in response to an RFQ they received.
 *
 * A quote is FINAL. Once sent (status "quoted") the supplier can't change or resend it. Only the buyer can
 * reopen it (status "revision_requested"), which allows exactly one new quote. Old quotes are kept as history.
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

    // Only "sent" (first quote) and "revision_requested" (the buyer reopened it) accept a quote.
    if (rfq.status !== "sent" && rfq.status !== "revision_requested") {
      return res.status(409).json({
        error:
          rfq.status === "accepted"
            ? "The buyer has already accepted your quote."
            : "You've already sent a quote for this RFQ. Quotes can't be changed once sent.",
      });
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

    // RFQs raised by the procurement agent carry a fixed unit price. The form locks the field,
    // but the server decides: whatever the supplier sends for price, quantity, product or
    // currency is replaced with the RFQ's own values.
    const rfqLines = (Array.isArray(rfq.lineItems) ? rfq.lineItems : []) as RfqLine[];
    const priceLocked = rfqLines.length > 0 && rfqLines.every((li) => typeof li.unitPrice === "number");

    let lineItemQuotes = body.lineItemQuotes as (RfqLine & { lineTotal?: number })[];
    if (priceLocked) {
      if (lineItemQuotes.length !== rfqLines.length) {
        return res.status(400).json({ error: "Your quote must include every line item of this RFQ" });
      }
      lineItemQuotes = lineItemQuotes.map((li, i) => {
        const unitPrice = rfqLines[i].unitPrice as number;
        const quantity = rfqLines[i].quantity ?? 0;
        return {
          ...li,
          productName: rfqLines[i].productName ?? li.productName,
          quantity,
          unitPrice,
          lineTotal: round2(unitPrice * quantity),
        };
      });
    }

    // The fixed price is in the RFQ's currency, so a locked quote can never use another one.
    const currency = priceLocked ? (rfq.currency ?? null) : (body.currency ?? rfq.currency ?? null);

    const totalPrice = round2(
      lineItemQuotes.reduce((sum: number, li: { lineTotal?: number }) => sum + (li.lineTotal ?? 0), 0)
    );

    // One transaction. Claiming the RFQ comes first: only one request can move it to "quoted",
    // so a double-click or a second tab can never create a second quote.
    const quote = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(rfqs)
        .set({ status: "quoted", updatedAt: new Date() })
        .where(and(eq(rfqs.id, rfq.id), inArray(rfqs.status, ["sent", "revision_requested"])))
        .returning({ id: rfqs.id });
      if (claimed.length === 0) return null;

      const [q] = await tx
        .insert(rfqQuotes)
        .values({
          rfqId: rfq.id,
          supplierId: req.supplier!.supplierId,
          currency,
          totalPrice: totalPrice || null,
          leadTimeDays: body.leadTimeDays ?? null,
          validUntil: validUntil.value,
          paymentTerms: body.paymentTerms ?? null,
          notes: body.notes ?? null,
          lineItemQuotes,
        })
        .returning();
      return q;
    });

    if (!quote) {
      return res.status(409).json({
        error: "You've already sent a quote for this RFQ. Quotes can't be changed once sent.",
      });
    }

    res.status(201).json({ quote });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * POST /api/rfqs/me/:id/decline-revision    Body: { note? }
 * The supplier can't (or won't) change their quote after the buyer asked for a revision. The ORIGINAL quote
 * stands (status goes back to "quoted") and the buyer is told why, so the RFQ never gets stuck waiting.
 */
rfqRouter.post("/me/:id/decline-revision", requireSupplierAuth, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "RFQ not found" });

    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
    const reply = note || "No reason given.";

    // Atomic: only moves revision_requested -> quoted, and only for THIS supplier's RFQ.
    const [updated] = await db
      .update(rfqs)
      .set({ status: "quoted", revisionReply: reply, updatedAt: new Date() })
      .where(
        and(
          eq(rfqs.id, req.params.id),
          eq(rfqs.supplierId, req.supplier!.supplierId),
          eq(rfqs.status, "revision_requested")
        )
      )
      .returning();
    if (!updated) {
      return res.status(409).json({ error: "There's no open revision request to decline on this RFQ." });
    }

    // Tell the buyer. A mail failure never undoes the answer; `notified` tells the UI.
    let notified = false;
    try {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const link = `${process.env.APP_URL}/quotes/${updated.id}`;
      const subject = `Supplier kept the original quote for RFQ ${updated.referenceNumber}`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#ea580c;">The supplier kept their original quote</h2>
          <p>${esc(updated.supplierName ?? "The supplier")} can't change their quote for RFQ
             <strong>${esc(updated.referenceNumber)}</strong>.</p>
          <p><strong>Their reply:</strong><br>${esc(reply)}</p>
          <p><a href="${link}">Review the quote</a>. You can still accept it${
            updated.revisionCount < 2 ? " or ask again" : ""
          }.</p>
        </div>`;
      const text =
        `The supplier kept their original quote for RFQ ${updated.referenceNumber}.\n` +
        `Their reply: ${reply}\nReview it here: ${link}`;
      await sendMailBounded({ to: updated.requesterEmail, subject, html, text });
      notified = true;
    } catch (mailErr) {
      console.error(`Could not notify buyer about declined revision for RFQ ${updated.id}`, mailErr);
    }

    res.json({ rfq: updated, notified });
  } catch (err) {
    fail500(res, err);
  }
});

/**
 * GET /api/rfqs/:id
 * Procurer-facing: fetch a single RFQ (the one they just sent) along with
 * the supplier's quote history (newest first) and attached files. No auth,
 * so anyone who has the RFQ's id can read it. Add buyer auth before real use.
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

    // supplierId is null for an external supplier who hasn't submitted a quote yet.
    const [supplier] = rfq.supplierId
      ? await db
          .select({ id: suppliers.id, businessName: suppliers.businessName, contactName: suppliers.contactName })
          .from(suppliers)
          .where(eq(suppliers.id, rfq.supplierId))
          .limit(1)
      : [];

    const quotes = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id))
      .orderBy(desc(rfqQuotes.createdAt));

    const attachments = await db
      .select({ id: rfqAttachments.id, fileName: rfqAttachments.fileName, sizeBytes: rfqAttachments.sizeBytes })
      .from(rfqAttachments)
      .where(eq(rfqAttachments.rfqId, rfq.id));

    res.json({ rfq: { ...rfq, supplier: supplier ?? null, quotes, attachments } });
  } catch (err) {
    fail500(res, err);
  }
});