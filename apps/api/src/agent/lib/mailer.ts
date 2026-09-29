import nodemailer from "nodemailer";

/**
 * Uses your own SMTP mail server. Requires these env vars to be set on
 * the backend (not the frontend — these are server secrets):
 *
 *   SMTP_HOST      e.g. "mail.yourdomain.com"
 *   SMTP_PORT      e.g. "587" (STARTTLS) or "465" (implicit TLS)
 *   SMTP_SECURE    "true" if using port 465, "false" for 587/25
 *   SMTP_USER      login username for your mail server
 *   SMTP_PASS      login password / app password
 *   SMTP_FROM      the "From" address, e.g. "RFQs <rfq@yourdomain.com>"
 *
 * npm install nodemailer
 * npm install -D @types/nodemailer
 */

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured — set SMTP_HOST, SMTP_USER, and SMTP_PASS in the backend environment."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });

  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

/* ---------------------------------------------------------------------------
 * RFQ-specific email template
 * ------------------------------------------------------------------------ */

type RfqLineItem = {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
};

export function buildRfqNotificationEmail(rfq: {
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  dueDate: Date | null;
  currency: string | null;
  lineItems: RfqLineItem[];
}) {
  const dueDateStr = rfq.dueDate
    ? new Date(rfq.dueDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })
    : "Not specified";

  const itemRows = rfq.lineItems
    .map(
      (item) =>
        `<tr>
           <td style="padding:6px 10px;border:1px solid #e5e5e5;">${escapeHtml(item.productName)}</td>
           <td style="padding:6px 10px;border:1px solid #e5e5e5;">${escapeHtml(item.specification ?? "—")}</td>
           <td style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">${item.quantity} ${escapeHtml(
          item.unit ?? ""
        )}</td>
         </tr>`
    )
    .join("");

  const subject = `New RFQ ${rfq.referenceNumber} from ${rfq.requesterName}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#f97316;">New Request for Quotation</h2>
      <p>You've received a new RFQ from <strong>${escapeHtml(rfq.requesterName)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">
        <tr>
          <td style="padding:6px 10px;font-weight:bold;">Reference number</td>
          <td style="padding:6px 10px;">${escapeHtml(rfq.referenceNumber)}</td>
        </tr>
        <tr>
          <td style="padding:6px 10px;font-weight:bold;">Response due by</td>
          <td style="padding:6px 10px;">${dueDateStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 10px;font-weight:bold;">Currency</td>
          <td style="padding:6px 10px;">${escapeHtml(rfq.currency ?? "Not specified")}</td>
        </tr>
      </table>

      <h3 style="font-size:15px;">Line items</h3>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:left;">Product</th>
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:left;">Spec / standard</th>
            <th style="padding:6px 10px;border:1px solid #e5e5e5;text-align:right;">Quantity</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <p style="margin-top:24px;">Log in to your supplier dashboard to view the full RFQ, including
      delivery, payment, and compliance requirements, and to respond.</p>

      <p style="color:#888;font-size:12px;margin-top:32px;">
        Reply-to contact: ${escapeHtml(rfq.requesterEmail)}
      </p>
    </div>
  `;

  const text = `New RFQ ${rfq.referenceNumber} from ${rfq.requesterName}.
Due by: ${dueDateStr}
Currency: ${rfq.currency ?? "Not specified"}
Log in to your supplier dashboard to view full details and respond.
Contact: ${rfq.requesterEmail}`;

  return { subject, html, text };
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}