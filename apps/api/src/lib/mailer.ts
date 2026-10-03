// Save as: apps/api/src/lib/mailer.ts
import nodemailer, { type Transporter } from "nodemailer";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let transporter: Transporter | null = null;

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASS in apps/api/.env)");
  }
  if (!transporter) {
    const port = Number(SMTP_PORT ?? 465);
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // true for 465, false for 587 (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // Fail fast if the host can't reach the SMTP server (e.g. blocked port)
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

/**
 * Sends one email from the platform's address, e.g. the "your order has shipped" notice.
 * The subject has line breaks stripped so a value taken from user input can't add headers.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}) {
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject.replace(/[\r\n]+/g, " ").trim(),
    text: opts.text,
    html: opts.html,
  });
}

/**
 * Emails a buyer's inquiry to a supplier.
 * SMTP servers only let you send "from" the account you log in with, so the
 * buyer goes in Reply-To: the supplier just hits Reply to answer them.
 */
export async function sendSupplierInquiryEmail(opts: {
  to: string;
  supplierName: string;
  senderName: string;
  senderEmail: string;
  message: string;
}) {
  const { to, supplierName, senderEmail, message } = opts;
  const senderName = opts.senderName.replace(/[\r\n"<>]/g, "").trim();

  await getTransporter().sendMail({
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
    to,
    replyTo: `"${senderName}" <${senderEmail}>`,
    subject: `New inquiry from ${senderName}`,
    text: `Hello ${supplierName},\n\n${senderName} (${senderEmail}) sent you a message:\n\n${message}\n\nReply to this email to respond directly.`,
    html: `
      <p>Hello ${escapeHtml(supplierName)},</p>
      <p><strong>${escapeHtml(senderName)}</strong> (${escapeHtml(senderEmail)}) sent you a message:</p>
      <blockquote style="margin:12px 0;padding-left:12px;border-left:3px solid #F97316;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
      <p style="color:#666;font-size:12px">Reply to this email to respond directly to the buyer.</p>`,
  });
}