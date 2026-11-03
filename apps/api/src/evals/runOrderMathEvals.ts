import { priceOrderLine } from "../lib/orderMath.js";
import { priceQuote } from "../procurement/lib/pricing.js";

export function runOrderMathEvals() {
  console.log("\n=== Order maths evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
    }
  };

  const throws = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };

  const rates = new Map<string, number>([
    ["USD", 1],
    ["INR", 96],
  ]);

  // 1. An order built from a quote must add up to the same total the plan showed.
  //    Same currency on both sides here, so there is no conversion rounding to allow for.
  const cases = [
    { name: "plain", unit: 100, qty: 50, tax: null, inclusive: false, ship: 200 },
    { name: "tax-exclusive", unit: 10.5, qty: 3, tax: 18, inclusive: false, ship: 5 },
    { name: "tax-inclusive", unit: 10.5, qty: 3, tax: 18, inclusive: true, ship: 5 },
    { name: "fractional-price", unit: 99.99, qty: 3, tax: null, inclusive: false, ship: 0 },
    { name: "tax-no-shipping", unit: 250, qty: 7, tax: 5, inclusive: false, ship: 0 },
  ];

  for (const c of cases) {
    const order = priceOrderLine({
      unitPrice: c.unit,
      quantity: c.qty,
      taxRate: c.tax,
      taxInclusive: c.inclusive,
      shippingCost: c.ship,
    });
    const plan = priceQuote(
      { unitPrice: c.unit, shippingCost: c.ship, currency: "INR", taxRate: c.tax, taxInclusive: c.inclusive },
      c.qty,
      rates,
      "INR"
    );
    const planTotalC = Math.round(plan.converted.total * 100);
    const planTaxC = Math.round(plan.converted.taxAmount * 100);
    const planShipC = Math.round(plan.converted.shipping * 100);
    check(`order-total-matches-plan-total (${c.name})`, order.totalC === planTotalC, `order ${order.totalC}, plan ${planTotalC}`);
    check(`order-tax-matches-plan-tax (${c.name})`, order.taxC === planTaxC, `order ${order.taxC}, plan ${planTaxC}`);
    check(`order-shipping-matches-plan-shipping (${c.name})`, order.shippingC === planShipC, `order ${order.shippingC}, plan ${planShipC}`);
  }

  // 2. Known answers worked out by hand.
  {
    const exclusive = priceOrderLine({ unitPrice: 10.5, quantity: 3, taxRate: 18, shippingCost: 5 });
    check("tax-exclusive-total-is-42.17", exclusive.totalC === 4217, `got ${exclusive.totalC}`);
    check("tax-exclusive-tax-is-5.67", exclusive.taxC === 567, `got ${exclusive.taxC}`);

    const inclusive = priceOrderLine({ unitPrice: 10.5, quantity: 3, taxRate: 18, taxInclusive: true, shippingCost: 5 });
    check("tax-inclusive-total-is-36.50", inclusive.totalC === 3650, `got ${inclusive.totalC}`);
    check("tax-inclusive-contained-tax-is-4.81", inclusive.taxC === 481, `got ${inclusive.taxC}`);
  }

  // 3. A line with no tax or shipping fields (a manual RFQ) totals goods only.
  {
    const manual = priceOrderLine({ unitPrice: 20, quantity: 5 });
    check("no-tax-no-shipping-is-goods-only", manual.totalC === 10000 && manual.taxC === 0 && manual.shippingC === 0);
  }

  // 4. Bad input must throw, never produce NaN or an undercharged order.
  {
    check("rejects-zero-quantity", throws(() => priceOrderLine({ unitPrice: 10, quantity: 0 })));
    check("rejects-fractional-quantity", throws(() => priceOrderLine({ unitPrice: 10, quantity: 2.5 })));
    check("rejects-nan-price", throws(() => priceOrderLine({ unitPrice: NaN, quantity: 1 })));
    check("rejects-negative-price", throws(() => priceOrderLine({ unitPrice: -1, quantity: 1 })));
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}