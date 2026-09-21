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

 const makeQuote = (overrides: Partial<QuoteScore> = {}): QuoteScore => ({
  supplierId: null,
  supplierRegion: null,
  supplierName: "Test",
  unitPrice: 100,
  quantityAvailable: 100,
  leadTimeDays: 5,
  shippingCost: 200,
  moq: 1,
  respondedAt: "",
  totalCost: 0,
  score: 1,
  rationale: "",
  ...overrides,
});

  const paise = (rupees: number) => Math.round(rupees * 100);

  // 1. Basic maths: items 50 × 100 = 5000, shipping 200, fee 3% of 5200 = 156
  {
    const invoice = calculateInvoice(makeQuote(), 50);
    const expectedTotal = 5000 + 200 + 156;
    check(
      "invoice-total-matches-expected-math",
      invoice.total === expectedTotal,
      `expected ${expectedTotal}, got ${invoice.total}`
    );
  }

  // 2. Line items always add up to the total (compared in paise)
  {
    const invoice = calculateInvoice(makeQuote(), 50);
    const sumPaise = invoice.lineItems.reduce((s, li) => s + paise(li.amount), 0);
    check(
      "line-items-sum-to-total",
      sumPaise === invoice.totalPaise,
      `line items sum to ${sumPaise} paise, total is ${invoice.totalPaise}`
    );
  }

  // 3. Fractional prices must not drift (99.99 × 3 = 299.96999999999997 in naive float maths)
  {
    const invoice = calculateInvoice(makeQuote({ unitPrice: 99.99, shippingCost: 0 }), 3);
    // items 299.97, fee 3% = 8.9991 -> ₹9.00, total 308.97
    check("fractional-price-has-no-float-drift", invoice.total === 308.97, `got ${invoice.total}`);
    check("total-is-integer-paise", Number.isInteger(invoice.totalPaise), `got ${invoice.totalPaise}`);
  }

  // 4. Bad input must throw, never produce NaN or an undercharged bill
  {
    const throws = (fn: () => unknown) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    check("rejects-zero-quantity", throws(() => calculateInvoice(makeQuote(), 0)));
    check("rejects-fractional-quantity", throws(() => calculateInvoice(makeQuote(), 2.5)));
    check(
      "rejects-missing-shipping",
      throws(() => calculateInvoice(makeQuote({ shippingCost: undefined as unknown as number }), 10))
    );
    check("rejects-nan-unit-price", throws(() => calculateInvoice(makeQuote({ unitPrice: NaN }), 10)));
    check("rejects-negative-unit-price", throws(() => calculateInvoice(makeQuote({ unitPrice: -5 }), 10)));
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}