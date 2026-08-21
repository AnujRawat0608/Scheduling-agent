import { findFreeGaps } from "../agent/lib/freeBusyMath.js";
import { freeBusyScenarios } from "./freeBusyScenarios.js";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

export function runFreeBusyEvals() {
  console.log("\n=== Free/busy logic evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  for (const scenario of freeBusyScenarios) {
    const slots = findFreeGaps({
      busyByAttendee: scenario.busyByAttendee,
      durationMinutes: scenario.durationMinutes,
      earliestStart: scenario.earliestStart,
      deadline: scenario.deadline,
    });

    const failures: string[] = [];
    const { assertions } = scenario;

    if (assertions.expectNoSlots && slots.length > 0) {
      failures.push(`expected 0 slots, got ${slots.length}`);
    }
    if (assertions.minSlotsFound !== undefined && slots.length < assertions.minSlotsFound) {
      failures.push(`expected >= ${assertions.minSlotsFound} slots, got ${slots.length}`);
    }
    if (assertions.maxSlotsFound !== undefined && slots.length > assertions.maxSlotsFound) {
      failures.push(`expected <= ${assertions.maxSlotsFound} slots, got ${slots.length}`);
    }
    if (assertions.mustNotOverlap) {
      for (const slot of slots) {
        for (const busy of assertions.mustNotOverlap) {
          if (overlaps(slot.start, slot.end, busy.start, busy.end)) {
            failures.push(
              `slot ${slot.start}-${slot.end} illegally overlaps busy block ${busy.start}-${busy.end}`
            );
          }
        }
      }
    }

    if (failures.length === 0) {
      passed++;
      console.log(`  PASS  ${scenario.name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${scenario.name}`);
      console.log(`        ${scenario.description}`);
      failures.forEach((f) => console.log(`        - ${f}`));
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}