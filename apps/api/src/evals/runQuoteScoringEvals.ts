import { scoreQuotes } from "../procurement/lib/scoreQuotes.js";
import type { SupplierQuote } from "../procurement/state.js";

export function runQuoteScoringEvals() {
  console.log("\n=== Quote scoring evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  {
    const quotes: SupplierQuote[] = [
      { supplierName: "A", unitPrice: 4800, quantityAvailable: 100, leadTimeDays: 7, shippingCost: 200, moq: 1, respondedAt: "" },
      { supplierName: "B", unitPrice: 4550, quantityAvailable: 100, leadTimeDays: 14, shippingCost: 200, moq: 1, respondedAt: "" },
      { supplierName: "C", unitPrice: 4700, quantityAvailable: 100, leadTimeDays: 5, shippingCost: 200, moq: 1, respondedAt: "" },
    ];
    const scored = scoreQuotes(quotes, 50);
    const top = scored[0];

    if (top.supplierName !== "B") {
      passed++;
      console.log(`  PASS  does-not-blindly-pick-cheapest (recommended: ${top.supplierName})`);
    } else {
      failed++;
      console.log(`  FAIL  does-not-blindly-pick-cheapest — picked ${top.supplierName} (14-day lead time) purely on price`);
    }
  }

  {
    const quotes: SupplierQuote[] = [
      { supplierName: "TooSmall", unitPrice: 100, quantityAvailable: 10, leadTimeDays: 1, shippingCost: 0, moq: 1, respondedAt: "" },
      { supplierName: "CanFulfill", unitPrice: 500, quantityAvailable: 200, leadTimeDays: 10, shippingCost: 50, moq: 1, respondedAt: "" },
    ];
    const scored = scoreQuotes(quotes, 100);
    const top = scored[0];

    if (top.supplierName === "CanFulfill") {
      passed++;
      console.log("  PASS  excludes-suppliers-that-cant-fulfill-quantity");
    } else {
      failed++;
      console.log(`  FAIL  excludes-suppliers-that-cant-fulfill-quantity — recommended ${top.supplierName}`);
    }
  }

  {
    const quotes: SupplierQuote[] = [
      { supplierName: "X", unitPrice: 1000, quantityAvailable: 50, leadTimeDays: 5, shippingCost: 100, moq: 1, respondedAt: "" },
      { supplierName: "Y", unitPrice: 1000, quantityAvailable: 50, leadTimeDays: 5, shippingCost: 100, moq: 1, respondedAt: "" },
    ];
    const scored = scoreQuotes(quotes, 10);
    if (scored[0].score === scored[1].score) {
      passed++;
      console.log("  PASS  identical-quotes-score-identically");
    } else {
      failed++;
      console.log("  FAIL  identical-quotes-score-identically");
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}