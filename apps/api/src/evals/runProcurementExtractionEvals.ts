import { extractProcurementRequest } from "../procurement/nodes/extractRequest.js";
import { procurementExtractionScenarios } from "./procurementExtractionScenarios.js";

/** Letters and digits only, lowercase, so "USB-C connector" matches "usbc". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Sends each scenario to the real procurement extractor (one Groq call each) and checks the
 * item count, each item's name and quantity, and the required-by date.
 *
 * This is an LLM eval, so a failure is a finding, not necessarily a code bug. It reports a pass
 * rate and does not fail the whole run. Run it twice to see how stable the answers are.
 */
export async function runProcurementExtractionEvals() {
  console.log("\n=== Procurement extraction evals (LLM) ===\n");
  let totalChecks = 0;
  let passedChecks = 0;

  for (const scenario of procurementExtractionScenarios) {
    console.log(`  ${scenario.name}`);
    console.log(`    input: ${JSON.stringify(scenario.text.length > 90 ? scenario.text.slice(0, 90) + "..." : scenario.text)}`);

    const checks: { label: string; pass: boolean; detail?: string }[] = [];

    try {
      const extracted = await extractProcurementRequest(scenario.text);
      const items = extracted.lineItems ?? [];

      checks.push({
        label: "item count",
        pass: items.length === scenario.expected.items.length,
        detail: `expected ${scenario.expected.items.length}, got ${items.length}`,
      });

      for (const exp of scenario.expected.items) {
        const found = items.find((li) => squash(li.item).includes(squash(exp.nameContains)));
        checks.push({
          label: `item "${exp.nameContains}" found`,
          pass: !!found,
          detail: `got [${items.map((li) => li.item).join(" | ")}]`,
        });
        checks.push({
          label: `quantity for "${exp.nameContains}"`,
          pass: found?.quantity === exp.quantity,
          detail: `expected ${exp.quantity}, got ${found?.quantity}`,
        });
      }

      const gotDate = extracted.requiredBy ? String(extracted.requiredBy).slice(0, 10) : null;
      checks.push({
        label: "required-by date",
        pass: gotDate === scenario.expected.requiredBy,
        detail: `expected ${scenario.expected.requiredBy}, got ${gotDate}`,
      });
    } catch (err) {
      checks.push({ label: "extractor ran", pass: false, detail: String((err as Error)?.message ?? err) });
    }

    for (const check of checks) {
      totalChecks++;
      if (check.pass) {
        passedChecks++;
        console.log(`    PASS  ${check.label}`);
      } else {
        console.log(`    FAIL  ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
      }
    }
    console.log("");
  }

  console.log(`  ${passedChecks}/${totalChecks} checks passed\n`);
  return { passedChecks, totalChecks };
}