import { convert, type RateTable } from "./fxMath.js";
import type { PricingBreakdown } from "../state.js";

export interface PricingInput {
  unitPrice: number;
  shippingCost: number;
  currency: string;
  taxRate: number | null;
  taxInclusive: boolean;
}

// All maths in integer cents (assumes 2-decimal currencies, which is why the allowlist excludes JPY/KWD).
const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

export function priceQuote(
  q: PricingInput,
  quantity: number,
  rates: RateTable,
  buyerCurrency = "INR"
): PricingBreakdown {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(`quantity must be a positive whole number, got ${quantity}`);
  }
  if (!Number.isFinite(q.unitPrice) || q.unitPrice < 0 || !Number.isFinite(q.shippingCost) || q.shippingCost < 0) {
    throw new RangeError("unitPrice and shippingCost must be non-negative numbers");
  }

  const rate = q.taxRate ?? 0;
  const grossC = toCents(q.unitPrice) * quantity;
  const shippingC = toCents(q.shippingCost);

  let netC = grossC;
  let taxC = 0;
  if (rate > 0) {
    if (q.taxInclusive) {
      netC = Math.round(grossC / (1 + rate / 100));
      taxC = grossC - netC;
    } else {
      taxC = Math.round((grossC * rate) / 100);
    }
  }
  const totalC = netC + taxC + shippingC; // inclusive: net + tax == gross, so this works for both

  // Convert each line separately and sum the rounded lines, so the breakdown always adds up.
  const conv = (cents: number) => toCents(convert(rates, fromCents(cents), q.currency, buyerCurrency).amount);
  const cNet = conv(netC);
  const cTax = conv(taxC);
  const cShip = conv(shippingC);

  return {
    supplierCurrency: q.currency,
    buyerCurrency,
    fxRate: convert(rates, 1, q.currency, buyerCurrency).rate,
    taxRate: q.taxRate,
    taxInclusive: q.taxInclusive,
    unitPriceConverted: fromCents(toCents(convert(rates, q.unitPrice, q.currency, buyerCurrency).amount)),
    local: {
      subtotal: fromCents(netC),
      taxAmount: fromCents(taxC),
      shipping: fromCents(shippingC),
      total: fromCents(totalC),
    },
    converted: {
      subtotal: fromCents(cNet),
      taxAmount: fromCents(cTax),
      shipping: fromCents(cShip),
      total: fromCents(cNet + cTax + cShip),
    },
  };
}