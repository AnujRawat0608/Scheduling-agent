import { Router } from "express";
import path from "node:path";
import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqQuotes } from "../db/rfqQuotesSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { rfqInvites, rfqAttachments } from "../db/rfqExternalSchema.js";
import { hashToken } from "../lib/rfqInvites.js";
import { UPLOAD_ROOT } from "./rfqAttachments.js";

/** Public, token-protected routes for EXTERNAL suppliers. Mount at /api/rfq-respond. */
export const rfqRespondRouter = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** The supplier may send a quote only in these states. After sending, only the buyer can reopen it. */
const QUOTABLE = ["sent", "revision_requested"] as const;

// Same in-memory limiter style as your POST /api/rfqs: 120 requests per IP per 15 min.
const hits = new Map<string, number[]>();
rfqRespondRouter.use((req, res, next) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 120) return res.status(429).json({ error: "Too many requests. Try again later." });
  hits.set(ip, [...recent, now]);
  next();
});

async function loadInvite(token: string) {
  const [row] = await db
    .select({ invite: rfqInvites, rfq: rfqs })
    .from(rfqInvites)
    .innerJoin(rfqs, eq(rfqs.id, rfqInvites.rfqId))
    .where(eq(rfqInvites.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) throw new HttpError(404, "This link isn't valid.");
  if (row.invite.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, "This link has expired. Ask the buyer to resend the RFQ.");
  }
  if (row.rfq.status === "draft") throw new HttpError(404, "This link isn't valid.");
  return row;
}

/** GET /api/rfq-respond/:token: the RFQ as the supplier should see it. */
rfqRespondRouter.get("/:token", async (req, res, next) => {
  try {
    const { invite, rfq } = await loadInvite(req.params.token);
    const attachments = await db
      .select({ id: rfqAttachments.id, fileName: rfqAttachments.fileName, sizeBytes: rfqAttachments.sizeBytes })
      .from(rfqAttachments)
      .where(eq(rfqAttachments.rfqId, rfq.id));
    const [currentQuote] = await db
      .select()
      .from(rfqQuotes)
      .where(eq(rfqQuotes.rfqId, rfq.id))
      .orderBy(desc(rfqQuotes.createdAt))
      .limit(1);

    res.json({
      accepted: rfq.status === "accepted",
      locked: !(QUOTABLE as readonly string[]).includes(rfq.status), // quote sent: show read-only, hide the price form
      revisionRequested: rfq.status === "revision_requested",
      revisionNote: rfq.status === "revision_requested" ? rfq.revisionNote : null,
      revisionCount: rfq.revisionCount,
      submittedAt: invite.usedAt,
      currentQuote: currentQuote ?? null,
      supplier: { name: rfq.supplierName, email: rfq.supplierEmail, contactName: rfq.supplierContactName },
      rfq: {
        referenceNumber: rfq.referenceNumber,
        requesterName: rfq.requesterName,
        requesterEmail: rfq.requesterEmail,
        dueDate: rfq.dueDate,
        currency: rfq.currency,
        incoterm: rfq.incoterm,
        incotermPlace: rfq.incotermPlace,
        priceValidUntil: rfq.priceValidUntil,
        lineItems: rfq.lineItems,
        scopeNotes: rfq.scopeNotes,
        assumptionsExclusions: rfq.assumptionsExclusions,
        paymentTerms: rfq.paymentTerms,
        deliveryAddress: rfq.deliveryAddress,
        requiredDeliveryDate: rfq.requiredDeliveryDate,
        packagingRequirements: rfq.packagingRequirements,
        warrantyPeriod: rfq.warrantyPeriod,
        qualityRequirements: rfq.qualityRequirements,
        requiredCertifications: rfq.requiredCertifications,
        insuranceRequired: rfq.insuranceRequired,
        notes: rfq.notes,
        attachments,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/rfq-respond/:token/files/:attachmentId: download one CAD/drawing file. */
rfqRespondRouter.get("/:token/files/:attachmentId", async (req, res, next) => {
  try {
    const { rfq } = await loadInvite(req.params.token);
    if (!UUID_RE.test(req.params.attachmentId)) throw new HttpError(404, "File not found");
    const [file] = await db
      .select()
      .from(rfqAttachments)
      .where(and(eq(rfqAttachments.id, req.params.attachmentId), eq(rfqAttachments.rfqId, rfq.id)))
      .limit(1);
    if (!file) throw new HttpError(404, "File not found");
    res.download(path.join(UPLOAD_ROOT, file.storageKey), file.fileName);
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/rfq-respond/:token: submit (or revise) a quote.
 * Body: { lineItems: [{ unitPrice }] in the SAME ORDER as the RFQ's lines,
 *         leadTimeDays?, validUntil?, paymentTerms?, notes?, contactName?, phone? }
 * Creates the supplier account if none exists for this email, attaches it to the RFQ,
 * and stores the quote like POST /api/rfqs/me/:id/quote does.
 * A quote is FINAL: once sent (status "quoted") the supplier can't change or resend it. Only the buyer can
 * reopen it (status "revision_requested"), which allows exactly one new quote. Old quotes are kept as history.
 */
rfqRespondRouter.post("/:token", async (req, res, next) => {
  try {
    const { rfq } = await loadInvite(req.params.token);
    if (!(QUOTABLE as readonly string[]).includes(rfq.status)) {
      throw new HttpError(
        409,
        rfq.status === "accepted"
          ? "The buyer has already accepted your quote."
          : "You've already sent a quote for this RFQ. Quotes can't be changed once sent."
      );
    }
    if (!rfq.supplierEmail) throw new HttpError(409, "This RFQ has no supplier email on file.");

    const b = req.body ?? {};
    const rfqLines = (Array.isArray(rfq.lineItems) ? rfq.lineItems : []) as {
      productName?: string; specification?: string | null; unit?: string | null; quantity?: number;
    }[];
    const input = Array.isArray(b.lineItems) ? b.lineItems : [];
    if (rfqLines.length === 0 || input.length !== rfqLines.length) {
      throw new HttpError(400, "Your quote must include a price for every line item.");
    }
    if (b.leadTimeDays != null && (!Number.isInteger(b.leadTimeDays) || b.leadTimeDays < 0)) {
      throw new HttpError(400, "leadTimeDays must be a non-negative whole number");
    }
    const validUntil = b.validUntil ? new Date(b.validUntil) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) throw new HttpError(400, "validUntil is not a valid date");

    // Totals are computed here from the RFQ's quantities, never taken from the browser.
    const lineItemQuotes = rfqLines.map((line, i) => {
      const unitPrice = Number(input[i]?.unitPrice);
      const quantity = line.quantity ?? 0;
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice >= 10_000_000) {
        throw new HttpError(400, `Enter a valid unit price for "${line.productName ?? `item ${i + 1}`}".`);
      }
      return {
        productName: line.productName ?? `Item ${i + 1}`,
        specification: line.specification ?? null,
        unit: line.unit ?? null,
        quantity,
        unitPrice,
        lineTotal: round2(unitPrice * quantity),
      };
    });
    const totalPrice = round2(lineItemQuotes.reduce((s, l) => s + l.lineTotal, 0));
    const email = rfq.supplierEmail.trim().toLowerCase();

    const result = await db.transaction(async (tx) => {
      // Serialise concurrent submissions for the same email so we never create two accounts.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

      // Claim the RFQ: only one request can move it from "sent" to "quoted" (blocks double-clicks and replays).
      const claimed = await tx
        .update(rfqs)
        .set({ status: "quoted", updatedAt: new Date() })
        .where(and(eq(rfqs.id, rfq.id), inArray(rfqs.status, [...QUOTABLE])))
        .returning({ id: rfqs.id });
      if (claimed.length === 0) {
        throw new HttpError(409, "You've already sent a quote for this RFQ. Quotes can't be changed once sent.");
      }

      let [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(sql`lower(${suppliers.email}) = ${email}`)
        .limit(1);
      const accountCreated = !supplier;
      if (!supplier) {
        // If `suppliers` has other NOT NULL columns (password hash, etc.), set them here.
        [supplier] = await tx
          .insert(suppliers)
          .values({
            businessName: rfq.supplierName || email,
            contactName: (typeof b.contactName === "string" && b.contactName.trim()) || rfq.supplierContactName,
            email,
            // Not a valid bcrypt/argon hash, so password login can never succeed until the supplier
            // sets a password through a "set your password" link (see the TODO after the transaction).
            passwordHash: `!unset:${crypto.randomBytes(32).toString("hex")}`,
            phone: typeof b.phone === "string" && b.phone.trim() ? b.phone.trim().slice(0, 50) : null,
            verificationStatus: "pending",
          })
          .returning({ id: suppliers.id });
      }

      await tx
        .update(rfqs)
        .set({ supplierId: supplier.id, updatedAt: new Date() })
        .where(eq(rfqs.id, rfq.id));

      const [quote] = await tx
        .insert(rfqQuotes)
        .values({
          rfqId: rfq.id,
          supplierId: supplier.id,
          currency: rfq.currency, // quote in the currency the buyer asked for
          totalPrice: totalPrice || null,
          leadTimeDays: b.leadTimeDays ?? null,
          validUntil,
          paymentTerms: b.paymentTerms ?? rfq.paymentTerms ?? null,
          notes: typeof b.notes === "string" ? b.notes.slice(0, 2000) : null,
          lineItemQuotes,
        })
        .returning();

      await tx
        .update(rfqInvites)
        .set({ usedAt: new Date() })
        .where(and(eq(rfqInvites.rfqId, rfq.id), sql`${rfqInvites.usedAt} is null`));

      return { quote, accountCreated };
    });

    // After commit, TODO (never fail the response over these):
    //  - if accountCreated: email a "set your password / finish your profile" link (same hashed-token pattern)
    //  - email rfq.requesterEmail that a quote arrived
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

rfqRespondRouter.use((err: unknown, _req: any, res: any, _next: any) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});