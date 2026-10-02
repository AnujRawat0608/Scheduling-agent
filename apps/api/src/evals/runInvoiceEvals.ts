import { calculateInvoice } from "../procurement/lib/calculateInvoice.js";
import type { QuoteScore } from "../procurement/state.js";

export function runInvoiceEvals() {
  console.log("\n=== Invoice calculation evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  const check = (name: string, ok: boolean, detail = "") => {
    if (ok) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    }
  };

  // Fixed rates so expected numbers are exact: 1 USD = 96 INR. No EUR on purpose.
  const rates = new Map<string, number>([
    ["USD", 1],
    ["INR", 96],
  ]);

  const makeQuote = (overrides: Partial<QuoteScore> = {}): QuoteScore => ({
    supplierId: null,
    supplierRegion: null,
    supplierName: "Test",
    unitPrice: 100,
    currency: "INR",
    quantityAvailable: 100,
    leadTimeDays: 5,
    shippingCost: 200,
    moq: 1,
    taxType: null,
    taxRate: null,
    taxInclusive: false,
    respondedAt: "",
    totalCost: 0,
    buyerCurrency: "INR",
    pricing: null,
    score: 1,
    rationale: "",
    isBest: false,
    ...overrides,
  });

  const throws = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };

  const minor = (amount: number) => Math.round(amount * 100);

  // 1. Basic maths, INR supplier and buyer, no tax, no platform fee: 50 × 100 + 200 shipping
  {
    const invoice = calculateInvoice(makeQuote(), 50, rates);
    check("invoice-total-matches-expected-math", invoice.total === 5200, `expected 5200, got ${invoice.total}`);
    check("no-platform-fee-line", !invoice.lineItems.some((li) => /fee/i.test(li.label)));
  }

  // 2. Line items always add up to the total (compared in minor units)
  {
    const cases: [string, QuoteScore, number][] = [
      ["plain", makeQuote(), 50],
      ["tax-exclusive", makeQuote({ taxRate: 18 }), 10],
      ["tax-inclusive", makeQuote({ taxRate: 18, taxInclusive: true }), 10],
      ["usd-supplier", makeQuote({ currency: "USD", unitPrice: 10.5, shippingCost: 5, taxRate: 18 }), 3],
    ];
    for (const [label, quote, qty] of cases) {
      const invoice = calculateInvoice(quote, qty, rates);
      const sum = invoice.lineItems.reduce((s, li) => s + minor(li.amount), 0);
      check(`line-items-sum-to-total (${label})`, sum === invoice.totalMinor, `lines ${sum}, total ${invoice.totalMinor}`);
    }
  }

  // 3. Fractional prices must not drift (99.99 × 3 = 299.96999999999997 in naive float maths)
  {
    const invoice = calculateInvoice(makeQuote({ unitPrice: 99.99, shippingCost: 0 }), 3, rates);
    check("fractional-price-has-no-float-drift", invoice.total === 299.97, `got ${invoice.total}`);
    check("total-is-integer-minor-units", Number.isInteger(invoice.totalMinor), `got ${invoice.totalMinor}`);
  }

  // 4. Currency conversion: Axme example, $2 × 50 + $11 shipping = $111 -> 10,656 INR at 96
  {
    const invoice = calculateInvoice(makeQuote({ currency: "USD", unitPrice: 2, shippingCost: 11 }), 50, rates);
    check("usd-supplier-converted-to-inr", invoice.total === 10656, `got ${invoice.total}`);
    check("supplier-total-kept-in-original-currency", invoice.supplierTotal === 111 && invoice.supplierCurrency === "USD");
    check("fx-rate-recorded", invoice.fxRate === 96, `got ${invoice.fxRate}`);
  }

  // 5. Tax added on top: 10 × 100 = 1000, 18% = 180, shipping 50 -> 1230
  {
    const invoice = calculateInvoice(makeQuote({ shippingCost: 50, taxRate: 18 }), 10, rates);
    check("tax-exclusive-adds-tax", invoice.totalMinor === 123000, `got ${invoice.totalMinor}`);
    check("tax-line-present", invoice.lineItems.some((li) => /tax/i.test(li.label) && li.amount === 180));
  }

  // 6. Price already includes tax: total must NOT grow, tax is shown as contained in it
  {
    const invoice = calculateInvoice(makeQuote({ shippingCost: 50, taxRate: 18, taxInclusive: true }), 10, rates);
    check("tax-inclusive-does-not-double-tax", invoice.totalMinor === 105000, `got ${invoice.totalMinor}`);
    const taxLine = invoice.lineItems.find((li) => /tax/i.test(li.label));
    check("tax-inclusive-shows-contained-tax", taxLine?.amount === 152.54, `got ${taxLine?.amount}`);
  }

  // 7. Zero tax rate behaves like no tax and adds no tax line
  {
    const invoice = calculateInvoice(makeQuote({ taxRate: 0 }), 10, rates);
    check("zero-tax-has-no-tax-line", !invoice.lineItems.some((li) => /tax/i.test(li.label)));
  }

  // 8. Bad input must throw, never produce NaN or an undercharged bill
  {
    check("rejects-zero-quantity", throws(() => calculateInvoice(makeQuote(), 0, rates)));
    check("rejects-fractional-quantity", throws(() => calculateInvoice(makeQuote(), 2.5, rates)));
    check(
      "rejects-missing-shipping",
      throws(() => calculateInvoice(makeQuote({ shippingCost: undefined as unknown as number }), 10, rates))
    );
    check("rejects-nan-unit-price", throws(() => calculateInvoice(makeQuote({ unitPrice: NaN }), 10, rates)));
    check("rejects-negative-unit-price", throws(() => calculateInvoice(makeQuote({ unitPrice: -5 }), 10, rates)));
    check(
      "rejects-currency-with-no-rate",
      throws(() => calculateInvoice(makeQuote({ currency: "EUR" }), 10, rates))
    );
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}