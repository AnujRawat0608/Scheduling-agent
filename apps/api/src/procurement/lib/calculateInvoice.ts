import type { QuoteScore } from "../state.js";

export interface InvoiceLineItem {
  label: string;
  /** Amount in rupees (always a clean 2-decimal value). */
  amount: number;
}

export interface Invoice {
  lineItems: InvoiceLineItem[];
  /** Total in rupees, for display. */
  total: number;
  /** Total in paise (integer). Store and compare this one. */
  totalPaise: number;
}

/**
 * Our revenue share on the order value (goods + shipping) — this is
 * the "usage-based fee tied to spend" from the monetization model.
 * Change this one constant if pricing changes; nothing else needs to.
 *
 * Kept in basis points (1 bp = 0.01%) so the fee maths stays in integers.
 */
const PLATFORM_FEE_BPS = 300; // 3%

const toPaise = (rupees: number) => Math.round(rupees * 100);
const toRupees = (paise: number) => paise / 100;

function assertMoney(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`Invoice: ${name} must be a non-negative number, got ${String(value)}`);
  }
}

/**
 * Deterministic invoice calculation for a confirmed order. No LLM
 * involved on purpose — a customer's bill must be exact, not a
 * model's best guess.
 *
 * All maths is done in integer paise, so results never drift
 * (e.g. 99.99 × 3 is exactly ₹299.97, not 299.96999999999997).
 * Throws if the quote or quantity is unusable, so a bad quote can
 * never turn into a NaN or undercharged bill.
 */
export function calculateInvoice(quote: QuoteScore, quantity: number): Invoice {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`Invoice: quantity must be a positive whole number, got ${String(quantity)}`);
  }
  assertMoney("unitPrice", quote.unitPrice);
  assertMoney("shippingCost", quote.shippingCost);

  const itemsPaise = toPaise(quote.unitPrice) * quantity;
  const shippingPaise = toPaise(quote.shippingCost);
  const feePaise = Math.round(((itemsPaise + shippingPaise) * PLATFORM_FEE_BPS) / 10_000);
  const totalPaise = itemsPaise + shippingPaise + feePaise;

  return {
    lineItems: [
      { label: `${quantity} × ₹${quote.unitPrice.toLocaleString("en-IN")}`, amount: toRupees(itemsPaise) },
      { label: "Shipping", amount: toRupees(shippingPaise) },
      { label: `Platform fee (${PLATFORM_FEE_BPS / 100}%)`, amount: toRupees(feePaise) },
    ],
    total: toRupees(totalPaise),
    totalPaise,
  };
}