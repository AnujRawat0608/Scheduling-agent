import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";
import { sendMailBounded } from "../agent/lib/mailSafe.js";
import { createInviteAndEmail } from "../lib/rfqInvites.js";

/** Mount at /api/rfq-orders (same prefix as the accept route). */
export const rfqRevisionRouter = Router();

/** How many times a buyer may reopen one RFQ. Keep in sync with MAX_REVISIONS in AcceptQuotePanel.tsx. */
export const MAX_REVISIONS = 2;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * POST /api/rfq-orders/:rfqId/request-revision    Body: { note }
 * The signed-in buyer reopens a quote they've received ("bargain reset"). The supplier may then send
 * exactly one new quote. If the buyer is happy with the quote they simply accept it and none of this runs.
 */
rfqRevisionRouter.post("/:rfqId/request-revision", requireProcurerAuth, async (req, res) => {
  try {
    const rfqId = req.params.rfqId;
    if (!UUID_RE.test(rfqId)) return res.status(404).json({ error: "RFQ not found" });

    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (note.length < 5 || note.length > 1000) {
      return res.status(400).json({ error: "Tell the supplier what you'd like changed (5 to 1000 characters)." });
    }

    const [rfq] = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.id, rfqId), eq(rfqs.procurerId, req.procurer!.procurerId)))
      .limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });

    if (rfq.status === "accepted") return res.status(409).json({ error: "You've already accepted this quote." });
    if (rfq.status === "revision_requested") {
      return res.status(409).json({ error: "You've already asked for a revision. Waiting for the supplier." });
    }
    if (rfq.status !== "quoted") return res.status(409).json({ error: "There's no quote to revise yet." });

    // Agent RFQs carry fixed catalog prices the supplier can't change, so there is nothing to renegotiate.
    const lines = (Array.isArray(rfq.lineItems) ? rfq.lineItems : []) as { unitPrice?: number }[];
    if (lines.length > 0 && lines.every((l) => typeof l.unitPrice === "number")) {
      return res.status(409).json({ error: "This RFQ has fixed prices, so it can't be revised." });
    }
    if (rfq.revisionCount >= MAX_REVISIONS) {
      return res.status(409).json({
        error: `You've used all ${MAX_REVISIONS} revision requests for this RFQ. Accept the quote or send a new RFQ.`,
      });
    }

    // Atomic: only one request can move it quoted → revision_requested.
    const [updated] = await db
      .update(rfqs)
      .set({
        status: "revision_requested",
        revisionCount: sql`${rfqs.revisionCount} + 1`,
        revisionNote: note,
        revisionRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(rfqs.id, rfq.id), eq(rfqs.status, "quoted"), sql`${rfqs.revisionCount} < ${MAX_REVISIONS}`)
      )
      .returning();
    if (!updated) return res.status(409).json({ error: "This quote just changed. Refresh the page and try again." });

    // Tell the supplier. A mail failure never undoes the request; `notified` tells the UI.
    let notified = false;
    try {
      if (updated.supplierType === "external") {
        // Rotates the link (fresh token + expiry) and sends the revision wording.
        await createInviteAndEmail(updated, { revisionNote: note });
        notified = true;
      } else {
        const [supplier] = await db
          .select({ email: suppliers.email })
          .from(suppliers)
          .where(eq(suppliers.id, updated.supplierId!))
          .limit(1);
        if (supplier?.email) {
          const subject = `Revision requested for RFQ ${updated.referenceNumber}`;
          const html = `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#ea580c;">The buyer asked for a revised quote</h2>
              <p><strong>${escapeHtml(updated.requesterName)}</strong> would like changes to your quote for RFQ
                 <strong>${escapeHtml(updated.referenceNumber)}</strong>.</p>
              <p><strong>What they would like changed:</strong><br>${escapeHtml(note)}</p>
              <p>Log in to your supplier dashboard to send one revised quote.</p>
            </div>`;
          const text =
            `Revision requested for RFQ ${updated.referenceNumber} by ${updated.requesterName}.\n` +
            `Requested changes: ${note}\nLog in to your supplier dashboard to send one revised quote.`;
          await sendMailBounded({ to: supplier.email, subject, html, text });
          notified = true;
        }
      }
    } catch (err) {
      console.error(`Could not notify supplier about revision for RFQ ${updated.id}`, err);
    }

    res.json({ rfq: updated, notified });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not request a revision" });
  }
});