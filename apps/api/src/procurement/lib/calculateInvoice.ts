import type { QuoteScore } from "../state.js";
import type { RateTable } from "./fxMath.js";
import { priceQuote } from "./pricing.js";

export interface InvoiceLineItem {
  label: string;
  /** In the buyer currency. */
  amount: number;
}

export interface Invoice {
  currency: string;
  lineItems: InvoiceLineItem[];
  /** Total in the buyer currency, for display. */
  total: number;
  /** Total in minor units (cents/paise). Store and compare this one. */
  totalMinor: number;
  /** The supplier's own currency and total, so the bill can be explained. */
  supplierCurrency: string;
  supplierTotal: number;
  fxRate: number;
}

/**
 * Deterministic invoice for a confirmed order. No LLM involved. Uses the same
 * priceQuote as the estimate shown in the UI, so the two always match.
 */
export function calculateInvoice(
  quote: QuoteScore,
  quantity: number,
  rates: RateTable,
  buyerCurrency = "INR"
): Invoice {
  const p = priceQuote(quote, quantity, rates, buyerCurrency); // throws on bad input or missing rate

  const lineItems: InvoiceLineItem[] = [
    { label: `${quantity} × ${quote.supplierName} unit price`, amount: p.converted.subtotal },
  ];
  if (p.converted.taxAmount > 0) {
    lineItems.push({
      label: p.taxInclusive
        ? `Tax included in price (${p.taxRate}%)`
        : `Tax as declared by supplier (${p.taxRate}%)`,
      amount: p.converted.taxAmount,
    });
  }
  lineItems.push({ label: "Shipping", amount: p.converted.shipping });

  return {
    currency: buyerCurrency,
    lineItems,
    total: p.converted.total,
    totalMinor: Math.round(p.converted.total * 100),
    supplierCurrency: p.supplierCurrency,
    supplierTotal: p.local.total,
    fxRate: p.fxRate,
  };
}