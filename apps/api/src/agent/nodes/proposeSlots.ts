import { differenceInCalendarDays } from "date-fns";
import type { SchedulingStateType, TimeSlot } from "../state.js";
import { findFreeGaps } from "../lib/freeBusyMath.js";

function rankSlots(candidates: TimeSlot[], referenceDate: Date): TimeSlot[] {
  const scored = candidates.map((slot) => {
    const start = new Date(slot.start);
    const daysOut = differenceInCalendarDays(start, referenceDate);
    const hour = start.getHours();

    const recencyScore = 1 / (1 + daysOut);
    const timeOfDayScore = hour >= 10 && hour <= 15 ? 1 : 0.6;

    return {
      ...slot,
      score: recencyScore * 0.6 + timeOfDayScore * 0.4,
      rationale:
        hour >= 10 && hour <= 15
          ? "Mid-day slot, soon as possible"
          : "Available, though outside core hours",
    };
  });

  const seenDays = new Set<string>();
  const picked: TimeSlot[] = [];

  for (const slot of scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    const dayKey = new Date(slot.start).toDateString();
    if (seenDays.has(dayKey)) continue;
    seenDays.add(dayKey);
    picked.push(slot);
    if (picked.length === 3) break;
  }

  return picked;
}

export async function proposeSlots(state: SchedulingStateType) {
  const { request, calendarData } = state;

  const candidates = findFreeGaps({
    busyByAttendee: calendarData,
    durationMinutes: request.durationMinutes,
    earliestStart: request.earliestStart,
    deadline: request.deadline,
  });

  const filtered = candidates.filter((slot) => {
    const hour = new Date(slot.start).getHours();
    if (request.avoidMornings && hour < 12) return false;
    if (request.avoidAfternoons && hour >= 12) return false;
    return true;
  });

  if (filtered.length === 0) {
    return {
      status: "awaiting_approval" as const,
      approvalRequest: {
        question:
          candidates.length > 0
            ? "Found open times, but none match the stated constraints (e.g. avoid mornings). How should I proceed?"
            : "No slot works for everyone in the search window. How should I proceed?",
        options: [] as TimeSlot[],
        allowFreeform: true,
      },
    };
  }

  const ranked = rankSlots(
    filtered,
    request.earliestStart ? new Date(request.earliestStart) : new Date()
  );

  return {
    proposedSlots: ranked,
    status: "awaiting_approval" as const,
    approvalRequest: {
      question: `Pick a time for "${request.title}"`,
      options: ranked,
      allowFreeform: true,
    },
  };
}