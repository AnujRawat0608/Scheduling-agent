import {
  addMinutes,
  isBefore,
  isAfter,
  setHours,
  setMinutes,
  addDays,
  formatISO,
} from "date-fns";
import type { BusySlot, TimeSlot } from "../state.js";

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const STEP_MINUTES = 30; // granularity to slide the candidate window

interface FindFreeGapsParams {
  busyByAttendee: Record<string, BusySlot[]>;
  durationMinutes: number;
  earliestStart?: string;
  deadline?: string;
}

/**
 * Deterministically finds every window of `durationMinutes` where none
 * of the known attendee calendars have a conflict, within working hours,
 * stepping in STEP_MINUTES increments. Attendees with no calendar data
 * (failed fetch) are simply excluded from the conflict check — the
 * human gets warned about that gap separately via calendarErrors.
 *
 * This is intentionally plain arithmetic, not LLM-driven — determinism
 * here matters more than flexibility. Ranking/preference is the LLM's
 * job (see proposeSlots.ts), correctness of "is this slot actually free"
 * is this function's job.
 */
export function findFreeGaps({
  busyByAttendee,
  durationMinutes,
  earliestStart,
  deadline,
}: FindFreeGapsParams): TimeSlot[] {
  const allBusy = Object.values(busyByAttendee).flat();
  const start = earliestStart ? new Date(earliestStart) : new Date();
  const end = deadline ? new Date(deadline) : addDays(start, 14);

  const results: TimeSlot[] = [];
  let cursor = setMinutes(setHours(start, WORK_START_HOUR), 0);

  while (isBefore(cursor, end) && results.length < 20) {
    const slotEnd = addMinutes(cursor, durationMinutes);
    const withinWorkingHours =
      cursor.getHours() >= WORK_START_HOUR && slotEnd.getHours() <= WORK_END_HOUR;
    const isWeekday = cursor.getDay() !== 0 && cursor.getDay() !== 6;

    const conflicts = allBusy.some(
      (b) => isBefore(cursor, new Date(b.end)) && isAfter(slotEnd, new Date(b.start))
    );

    if (withinWorkingHours && isWeekday && !conflicts && isAfter(cursor, start)) {
      results.push({ start: formatISO(cursor), end: formatISO(slotEnd) });
    }

    cursor =
      slotEnd.getHours() >= WORK_END_HOUR
        ? setMinutes(setHours(addDays(cursor, 1), WORK_START_HOUR), 0)
        : addMinutes(cursor, STEP_MINUTES);
  }

  return results;
}
