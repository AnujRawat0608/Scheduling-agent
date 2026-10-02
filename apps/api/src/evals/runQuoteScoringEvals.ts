import { scoreQuotes } from "../procurement/lib/scoreQuotes.js";
import type { SupplierQuote } from "../procurement/state.js";

export function runQuoteScoringEvals() {
  console.log("\n=== Quote scoring evals (deterministic) ===\n");
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

  const quote = (name: string, overrides: Partial<SupplierQuote> = {}): SupplierQuote => ({
    supplierName: name,
    supplierId: null,
    supplierRegion: null,
    unitPrice: 100,
    currency: "INR",
    quantityAvailable: 100,
    leadTimeDays: 5,
    shippingCost: 0,
    moq: 1,
    taxType: null,
    taxRate: null,
    taxInclusive: false,
    respondedAt: "",
    ...overrides,
  });

  // 1. Doesn't blindly pick the cheapest (B is cheapest but has a 14-day lead time)
  {
    const quotes = [
      quote("A", { unitPrice: 4800, leadTimeDays: 7, shippingCost: 200 }),
      quote("B", { unitPrice: 4550, leadTimeDays: 14, shippingCost: 200 }),
      quote("C", { unitPrice: 4700, leadTimeDays: 5, shippingCost: 200 }),
    ];
    const top = scoreQuotes(quotes, 50, rates)[0];
    check(
      "does-not-blindly-pick-cheapest",
      top.supplierName !== "B",
      `picked ${top.supplierName} (14-day lead time) purely on price`
    );
  }

  // 2. Excludes suppliers that can't fulfil the quantity
  {
    const quotes = [
      quote("TooSmall", { unitPrice: 100, quantityAvailable: 10, leadTimeDays: 1 }),
      quote("CanFulfill", { unitPrice: 500, quantityAvailable: 200, leadTimeDays: 10, shippingCost: 50 }),
    ];
    const top = scoreQuotes(quotes, 100, rates)[0];
    check("excludes-suppliers-that-cant-fulfill-quantity", top.supplierName === "CanFulfill", `recommended ${top.supplierName}`);
  }

  // 3. Identical quotes score identically
  {
    const quotes = [
      quote("X", { unitPrice: 1000, quantityAvailable: 50, shippingCost: 100 }),
      quote("Y", { unitPrice: 1000, quantityAvailable: 50, shippingCost: 100 }),
    ];
    const scored = scoreQuotes(quotes, 10, rates);
    check("identical-quotes-score-identically", scored[0].score === scored[1].score);
  }

  // 4. Currencies are compared fairly: $10 (= ₹960) is MORE expensive than ₹500,
  //    even though 10 < 500 as bare numbers (this was the original bug).
  {
    const quotes = [
      quote("UsdSupplier", { currency: "USD", unitPrice: 10 }),
      quote("InrSupplier", { currency: "INR", unitPrice: 500 }),
    ];
    const scored = scoreQuotes(quotes, 1, rates);
    const usd = scored.find((s) => s.supplierName === "UsdSupplier")!;
    check("usd-converted-to-inr", usd.totalCost === 960, `got ${usd.totalCost}`);
    check("ranks-by-converted-price-not-bare-number", scored[0].supplierName === "InrSupplier", `top was ${scored[0].supplierName}`);
  }

  // 5. Tax counts toward the total: ₹100 + 18% tax (₹118) is dearer than a tax-free ₹110
  {
    const quotes = [
      quote("Taxed", { unitPrice: 100, taxRate: 18 }),
      quote("TaxFree", { unitPrice: 110 }),
    ];
    const scored = scoreQuotes(quotes, 1, rates);
    const taxed = scored.find((s) => s.supplierName === "Taxed")!;
    check("tax-included-in-total", taxed.totalCost === 118, `got ${taxed.totalCost}`);
    check("tax-changes-ranking", scored[0].supplierName === "TaxFree", `top was ${scored[0].supplierName}`);
  }

  // 6. A valid quote that is worst on price AND lead time scores exactly 0.
  //    It is still fulfillable (only -1 means "cannot fulfill").
  {
    const quotes = [
      quote("Best", { unitPrice: 100, leadTimeDays: 2 }),
      quote("Worst", { unitPrice: 200, leadTimeDays: 10 }),
    ];
    const worst = scoreQuotes(quotes, 1, rates).find((s) => s.supplierName === "Worst")!;
    check("worst-valid-quote-scores-zero-not-minus-one", worst.score === 0, `got ${worst.score}`);
  }

  // 7. A quote in a currency with no exchange rate is flagged, doesn't crash the request,
  //    and doesn't stop other suppliers from being ranked.
  {
    const quotes = [
      quote("Euro", { currency: "EUR", unitPrice: 1 }),
      quote("Local", { unitPrice: 100 }),
    ];
    let scored: ReturnType<typeof scoreQuotes> = [];
    let threw = false;
    try {
      scored = scoreQuotes(quotes, 1, rates);
    } catch {
      threw = true;
    }
    const euro = scored.find((s) => s.supplierName === "Euro");
    check("missing-rate-does-not-crash", !threw);
    check("missing-rate-quote-marked-unusable", euro?.score === -1 && /cannot price/i.test(euro.rationale), `got ${euro?.score} / ${euro?.rationale}`);
    check("other-suppliers-still-ranked", scored[0]?.supplierName === "Local");
  }

  // 8. isBest is set only for the quote that is both cheapest and fastest
  {
    const quotes = [
      quote("Both", { unitPrice: 100, leadTimeDays: 1 }),
      quote("Slower", { unitPrice: 120, leadTimeDays: 5 }),
    ];
    const scored = scoreQuotes(quotes, 1, rates);
    check("isBest-set-on-cheapest-and-fastest", scored.find((s) => s.supplierName === "Both")?.isBest === true);
    check("isBest-not-set-on-others", scored.find((s) => s.supplierName === "Slower")?.isBest === false);
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}