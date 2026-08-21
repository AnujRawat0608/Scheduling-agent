import { addDays, formatISO, setHours, setMinutes, getDay } from "date-fns";
import { proposeSlots } from "../agent/nodes/proposeSlots.js";
import type { SchedulingStateType } from "../agent/state.js";

function nextWeekdayIso(minDaysAhead: number, hour: number, minute = 0): string {
  let offset = minDaysAhead;
  while (getDay(addDays(new Date(), offset)) === 0 || getDay(addDays(new Date(), offset)) === 6) {
    offset++;
  }
  const base = setMinutes(setHours(addDays(new Date(), offset), hour), minute);
  return formatISO(base);
}

export async function runConstraintEvals() {
  console.log("\n=== Constraint enforcement evals (deterministic) ===\n");
  let passed = 0;
  let failed = 0;

  {
    const state = {
      request: {
        organizer: { id: "1", email: "organizer@test.com" },
        attendees: [],
        durationMinutes: 30,
        title: "Test",
        earliestStart: nextWeekdayIso(1, 0, 0),
        deadline: nextWeekdayIso(1, 23, 59),
        avoidMornings: true,
      },
      calendarData: {},
    } as unknown as SchedulingStateType;

    const result = await proposeSlots(state);
    const slots = result.proposedSlots ?? [];
    const violation = slots.find((s) => new Date(s.start).getHours() < 12);

    if (slots.length > 0 && !violation) {
      passed++;
      console.log("  PASS  avoid-mornings-excludes-am-slots");
    } else {
      failed++;
      console.log("  FAIL  avoid-mornings-excludes-am-slots");
      if (violation) console.log(`        proposed a morning slot: ${violation.start}`);
      if (slots.length === 0) console.log("        proposed zero slots — check the filter isn't over-excluding");
    }
  }

  {
    const state = {
      request: {
        organizer: { id: "1", email: "organizer@test.com" },
        attendees: [],
        durationMinutes: 30,
        title: "Test",
        earliestStart: nextWeekdayIso(2, 0, 0),
        deadline: nextWeekdayIso(2, 23, 59),
        avoidAfternoons: true,
      },
      calendarData: {},
    } as unknown as SchedulingStateType;

    const result = await proposeSlots(state);
    const slots = result.proposedSlots ?? [];
    const violation = slots.find((s) => new Date(s.start).getHours() >= 12);

    if (slots.length > 0 && !violation) {
      passed++;
      console.log("  PASS  avoid-afternoons-excludes-pm-slots");
    } else {
      failed++;
      console.log("  FAIL  avoid-afternoons-excludes-pm-slots");
      if (violation) console.log(`        proposed an afternoon slot: ${violation.start}`);
      if (slots.length === 0) console.log("        proposed zero slots — check the filter isn't over-excluding");
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}