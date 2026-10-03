import type { supplierOrders, supplierOrderItems } from "../db/suppliersSchema.js";
import { sendEmail } from "./mailer.js";

type OrderRow = typeof supplierOrders.$inferSelect;
type ItemRow = typeof supplierOrderItems.$inferSelect;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function formatTotal(amount: string | null, currency: string): string {
  if (amount === null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

/**
 * The email a buyer gets when the supplier starts shipping. Everything that came from a
 * user (names, address, item names) is HTML-escaped before it goes into the HTML body.
 */
export function buildShippedEmail(order: OrderRow, items: ItemRow[], supplierName: string) {
  const total = formatTotal(order.total, order.currency);
  const itemLines = items.map((i) => `${i.quantity} x ${i.itemName}`);

  const subject = `Your order from ${supplierName} is on its way`;

  const text = [
    `Hi ${order.requesterName},`,
    "",
    `${supplierName} has started shipping your order.`,
    "",
    ...itemLines,
    ...(total ? ["", `Order total: ${total}`] : []),
    "",
    `Delivery address: ${order.deliveryAddress}`,
    `Order ID: ${order.id}`,
  ].join("\n");

  const html = `
    <p>Hi ${escapeHtml(order.requesterName)},</p>
    <p><strong>${escapeHtml(supplierName)}</strong> has started shipping your order.</p>
    <ul>${itemLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
    ${total ? `<p>Order total: <strong>${escapeHtml(total)}</strong></p>` : ""}
    <p>Delivery address: ${escapeHtml(order.deliveryAddress)}<br/>Order ID: ${escapeHtml(order.id)}</p>
  `;

  return { to: order.requesterEmail, subject, text, html };
}

/**
 * Tells the buyer their order has shipped. Returns true if the email was handed to the
 * mail server. If SMTP is not set up or the send fails, it throws, and the ship route
 * catches that and reports notified: false (the order stays shipped).
 */
export async function notifyBuyerOrderShipped(input: {
  order: OrderRow;
  items: ItemRow[];
  supplierName: string;
}): Promise<boolean> {
  const email = buildShippedEmail(input.order, input.items, input.supplierName);

  // The buyer's address was typed at checkout and is not verified, so check its shape.
  if (!EMAIL_RE.test(email.to)) {
    console.warn(`[notify] order ${input.order.id}: "${email.to}" is not a valid email address, skipping`);
    return false;
  }

  await sendEmail(email);
  console.log(`[notify] order ${input.order.id} shipped, emailed ${email.to}`);
  return true;
}