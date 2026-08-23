import "dotenv/config";
import { runFreeBusyEvals } from "./runFreeBusyEvals.js";
import { runConstraintEvals } from "./runConstraintEvals.js";
import { runExtractionEvals } from "./runExtractionEvals.js";
import { runQuoteScoringEvals } from "./runQuoteScoringEvals.js";

async function main() {
  const freeBusyResult = runFreeBusyEvals();
  const constraintResult = await runConstraintEvals();
  const extractionResult = await runExtractionEvals();
  const quoteScoringResult = runQuoteScoringEvals();

  console.log("=== Summary ===");
  console.log(`Free/busy logic:        ${freeBusyResult.passed}/${freeBusyResult.passed + freeBusyResult.failed} scenarios passed`);
  console.log(`Constraint enforcement: ${constraintResult.passed}/${constraintResult.passed + constraintResult.failed} scenarios passed`);
  console.log(`NL extraction (LLM):    ${extractionResult.passedChecks}/${extractionResult.totalChecks} checks passed`);
  console.log(`Quote scoring:          ${quoteScoringResult.passed}/${quoteScoringResult.passed + quoteScoringResult.failed} scenarios passed`);

  const hardFailure =
    freeBusyResult.failed > 0 || constraintResult.failed > 0 || quoteScoringResult.failed > 0;
  process.exit(hardFailure ? 1 : 0);
}

main();