import { parseNaturalLanguageRequest } from "../agent/lib/parseNaturalLanguageRequest.js";
import { extractionScenarios } from "./extractionScenarios.js";

export async function runExtractionEvals() {
  console.log("\n=== Natural-language extraction evals (LLM) ===\n");
  let totalChecks = 0;
  let passedChecks = 0;

  for (const scenario of extractionScenarios) {
    console.log(`  ${scenario.name}`);
    console.log(`    input: "${scenario.text}"`);

    try {
      const extracted = await parseNaturalLanguageRequest(scenario.text);
      const checks: { label: string; pass: boolean; detail?: string }[] = [];

      checks.push({
        label: "duration",
        pass: extracted.durationMinutes === scenario.expectedDurationMinutes,
        detail: `expected ${scenario.expectedDurationMinutes}, got ${extracted.durationMinutes}`,
      });

      const gotEmails = [...extracted.attendeeEmails].sort();
      const wantEmails = [...scenario.expectedAttendeeEmails].sort();
      checks.push({
        label: "attendee emails",
        pass: JSON.stringify(gotEmails) === JSON.stringify(wantEmails),
        detail: `expected [${wantEmails.join(", ")}], got [${gotEmails.join(", ")}]`,
      });

      if (scenario.expectedConstraintKeywords) {
        const constraintText = (extracted.constraints ?? "").toLowerCase();
        const foundAll = scenario.expectedConstraintKeywords.every((kw) =>
          constraintText.includes(kw.toLowerCase())
        );
        checks.push({
          label: "constraints captured",
          pass: foundAll,
          detail: `expected keywords [${scenario.expectedConstraintKeywords.join(", ")}] in "${extracted.constraints}"`,
        });

              if (scenario.expectedAvoidMornings !== undefined) {
        checks.push({
          label: "avoidMornings flag",
          pass: extracted.avoidMornings === scenario.expectedAvoidMornings,
          detail: `expected ${scenario.expectedAvoidMornings}, got ${extracted.avoidMornings}`,
        });
      }

      if (scenario.expectedAvoidAfternoons !== undefined) {
        checks.push({
          label: "avoidAfternoons flag",
          pass: extracted.avoidAfternoons === scenario.expectedAvoidAfternoons,
          detail: `expected ${scenario.expectedAvoidAfternoons}, got ${extracted.avoidAfternoons}`,
        });
      }
      
      }

      for (const check of checks) {
        totalChecks++;
        if (check.pass) {
          passedChecks++;
          console.log(`    PASS  ${check.label}`);
        } else {
          console.log(`    FAIL  ${check.label} — ${check.detail}`);
        }
      }
    } catch (err) {
      console.log(`    ERROR  ${String((err as Error)?.message ?? err)}`);
      totalChecks++;
    }

    console.log("");
  }

  console.log(`  ${passedChecks}/${totalChecks} checks passed\n`);
  return { passedChecks, totalChecks };
}