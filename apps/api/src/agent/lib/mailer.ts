import nodemailer from "nodemailer";

/**
 * Email sending. The provider is picked from the backend environment variables:
 *
 *  1. Resend (HTTPS API, works on hosts that block SMTP such as Render's free tier):
 *       RESEND_API_KEY
 *       MAIL_FROM          e.g. "RFQs <rfq@yourdomain.com>"  (domain must be verified in Resend)
 *
 *  2. Brevo (HTTPS API, free plan; the sender address can be verified with a confirmation email):
 *       BREVO_API_KEY
 *       MAIL_FROM          e.g. "RFQs <you@gmail.com>"       (must be a verified sender in Brevo)
 *
 *  3. SMTP (only if neither key above is set; blocked on Render's free tier):
 *       SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

type MailOptions = { to: string; subject: string; html: string; text?: string };

/* ---------------------------- HTTPS providers ---------------------------- */

const API_TIMEOUT_MS = 8_000; // kept below the 10 s bound in mailSafe.ts

/** Splits 'Name <a@b.com>' into { name, email }. A bare address gives no name. */
function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1].replace(/^"|"$/g, "") || undefined, email: m[2].trim() };
  return { email: from.trim() };
}

function requireFrom(): string {
  const from = process.env.MAIL_FROM ?? process.env.SMTP_FROM;
  if (!from) throw new Error("MAIL_FROM is not set (the 'From' address for outgoing email).");
  return from;
}

async function sendViaResend(opts: MailOptions) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requireFrom(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function sendViaBrevo(opts: MailOptions) {
  const sender = parseFrom(requireFrom());
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY as string,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Brevo error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/* --------------------------------- SMTP ---------------------------------- */

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "No email provider configured. Set RESEND_API_KEY or BREVO_API_KEY (plus MAIL_FROM), or SMTP_HOST, SMTP_USER and SMTP_PASS."
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
    // Without these, nodemailer waits about 2 minutes for a connection that never opens.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 15_000,
  });

  return transporter;
}

/* ------------------------------ Public API ------------------------------- */

export async function sendMail(opts: MailOptions) {
  if (process.env.RESEND_API_KEY) return sendViaResend(opts);
  if (process.env.BREVO_API_KEY) return sendViaBrevo(opts);

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