import "dotenv/config";
import { runFreeBusyEvals } from "./runFreeBusyEvals.js";
import { runConstraintEvals } from "./runConstraintEvals.js";
import { runExtractionEvals } from "./runExtractionEvals.js";
import { runQuoteScoringEvals } from "./runQuoteScoringEvals.js";
import { runInvoiceEvals } from "./runInvoiceEvals.js";
import { runOrderMathEvals } from "./runOrderMathEvals.js";
import { runAuthEvals } from "./runAuthEvals.js";

async function main() {
  // The first three belong to the original scheduling agent and go away with the legacy code.
  const freeBusyResult = runFreeBusyEvals();
  const constraintResult = await runConstraintEvals();
  const extractionResult = await runExtractionEvals();

  // Procurement.
  const quoteScoringResult = runQuoteScoringEvals();
  const invoiceResult = runInvoiceEvals();
  const orderMathResult = runOrderMathEvals();
  const authResult = runAuthEvals();

  const line = (r: { passed: number; failed: number }) => `${r.passed}/${r.passed + r.failed} checks passed`;

  console.log("=== Summary ===");
  console.log(`Free/busy logic (legacy scheduler):        ${line(freeBusyResult)}`);
  console.log(`Constraint enforcement (legacy scheduler): ${line(constraintResult)}`);
  console.log(`NL extraction (legacy scheduler, LLM):     ${extractionResult.passedChecks}/${extractionResult.totalChecks} checks passed`);
  console.log(`Quote scoring:                             ${line(quoteScoringResult)}`);
  console.log(`Invoice calculation:                       ${line(invoiceResult)}`);
  console.log(`Order maths (matches plan maths):          ${line(orderMathResult)}`);
  console.log(`Auth separation (buyer, supplier, admin):  ${line(authResult)}`);

  const hardFailure =
    freeBusyResult.failed > 0 ||
    constraintResult.failed > 0 ||
    quoteScoringResult.failed > 0 ||
    invoiceResult.failed > 0 ||
    orderMathResult.failed > 0 ||
    authResult.failed > 0;
  process.exit(hardFailure ? 1 : 0);
}

main();