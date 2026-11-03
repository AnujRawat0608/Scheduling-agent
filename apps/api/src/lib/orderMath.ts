/**
 * Money maths for one order line, in integer cents (2-decimal currencies only).
 *
 * Same rules as procurement/lib/pricing.ts, so an order built from an approved plan
 * adds up to the same total as the plan: tax-inclusive prices have the tax extracted,
 * tax-exclusive prices have it added, and shipping is added as given.
 */

export interface OrderLineInput {
  /** Per unit, in the order currency. */
  unitPrice: number;
  /** Positive whole number. */
  quantity: number;
  /** Percent, 0 to 100. Missing or out of range counts as no tax. */
  taxRate?: number | null;
  taxInclusive?: boolean;
  /** Shipping charged for this line, in the order currency. */
  shippingCost?: number | null;
}

export interface OrderLineCents {
  unitC: number;
  /** Goods, tax excluded. */
  netC: number;
  taxC: number;
  shippingC: number;
  /** net + tax + shipping. */
  totalC: number;
}

export function priceOrderLine(input: OrderLineInput): OrderLineCents {
  const { unitPrice, quantity } = input;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new RangeError("unitPrice must be a non-negative number");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("quantity must be a positive whole number");
  }

  const rawRate = Number(input.taxRate ?? 0);
  const rate = Number.isFinite(rawRate) && rawRate > 0 && rawRate <= 100 ? rawRate : 0;

  const rawShipping = Number(input.shippingCost ?? 0);
  const shippingC = Number.isFinite(rawShipping) && rawShipping > 0 ? Math.round(rawShipping * 100) : 0;

  const unitC = Math.round(unitPrice * 100);
  const grossC = unitC * quantity;

  let netC = grossC;
  let taxC = 0;
  if (rate > 0) {
    if (input.taxInclusive) {
      netC = Math.round(grossC / (1 + rate / 100));
      taxC = grossC - netC;
    } else {
      taxC = Math.round((grossC * rate) / 100);
    }
  }

  return { unitC, netC, taxC, shippingC, totalC: netC + taxC + shippingC };
}