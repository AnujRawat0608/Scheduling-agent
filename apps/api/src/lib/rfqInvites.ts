import crypto from "node:crypto";
import { db } from "../db/client.js";
import { rfqInvites } from "../db/rfqExternalSchema.js";
import { sendMailBounded } from "../agent/lib/mailSafe.js";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

type InviteRfq = {
  id: string;
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  dueDate: Date | null;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierContactName: string | null;
};

/** Creates (or rotates) the invite token for an RFQ and emails the link. Throws if the email can't be sent. */
export async function createInviteAndEmail(rfq: InviteRfq, opts: { revisionNote?: string } = {}) {
  const revising = Boolean(opts.revisionNote);
  if (!rfq.supplierEmail) throw new Error("RFQ has no supplier email");

  const token = crypto.randomBytes(32).toString("base64url");
  const base = rfq.dueDate?.getTime() ?? Date.now();
  const expiresAt = new Date(Math.max(base, Date.now()) + 14 * 24 * 60 * 60 * 1000); // due date + 14 days

  await db
    .insert(rfqInvites)
    .values({ rfqId: rfq.id, tokenHash: hashToken(token), expiresAt })
    .onConflictDoUpdate({
      target: rfqInvites.rfqId,
      set: { tokenHash: hashToken(token), expiresAt, usedAt: null },
    });

  const link = `${process.env.APP_URL}/rfq/respond/${token}`;
  const who = escapeHtml(rfq.supplierContactName || rfq.supplierName || "there");
  const due = rfq.dueDate ? rfq.dueDate.toDateString() : null;

  const subject = revising
    ? `Revision requested for RFQ ${rfq.referenceNumber}`
    : `Request for quotation ${rfq.referenceNumber} from ${rfq.requesterName}`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#ea580c;">${revising ? "The buyer asked for a revised quote" : "You have a new request for quotation"}</h2>
      <p>Hello ${who},</p>
      <p><strong>${escapeHtml(rfq.requesterName)}</strong> has sent you RFQ
         <strong>${escapeHtml(rfq.referenceNumber)}</strong>.</p>
      ${revising ? `<p><strong>What they would like changed:</strong><br>${escapeHtml(opts.revisionNote!)}</p><p>You can send one revised quote.</p>` : ""}
      <p>Open the link to review the requirements, download the drawings and submit your price.
         No account is needed. One is created for you when you submit.</p>
      <p><a href="${link}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">View RFQ and quote</a></p>
      ${due ? `<p>Please respond by <strong>${escapeHtml(due)}</strong>.</p>` : ""}
      <p style="color:#888;font-size:12px;margin-top:32px;">Buyer contact: ${escapeHtml(rfq.requesterEmail)}</p>
    </div>`;
  const text =
    (revising
      ? `Revision requested for RFQ ${rfq.referenceNumber} by ${rfq.requesterName}.\nRequested changes: ${opts.revisionNote}\n`
      : `New RFQ ${rfq.referenceNumber} from ${rfq.requesterName}.\n`) +
    `Review and quote (no account needed): ${link}\n` +
    (due ? `Respond by ${due}.\n` : "") +
    `Buyer contact: ${rfq.requesterEmail}`;

  await sendMailBounded({ to: rfq.supplierEmail, subject, html, text });
}