import { addDays, formatISO, setHours, setMinutes } from "date-fns";
import type { BusySlot } from "../agent/state.js";

export interface FreeBusyScenario {
  name: string;
  description: string;
  busyByAttendee: Record<string, BusySlot[]>;
  durationMinutes: number;
  earliestStart?: string;
  deadline?: string;
  assertions: {
    minSlotsFound?: number;
    maxSlotsFound?: number;
    mustNotOverlap?: BusySlot[];
    expectNoSlots?: boolean;
  };
}

function iso(dayOffset: number, hour: number, minute = 0): string {
  const base = setMinutes(setHours(addDays(new Date(), dayOffset), hour), minute);
  return formatISO(base);
}

export const freeBusyScenarios: FreeBusyScenario[] = [
  {
    name: "simple-gap-around-one-meeting",
    description: "One attendee has a single 1-2pm meeting tomorrow; agent must never propose that window.",
    busyByAttendee: {
      organizer: [{ start: iso(1, 13, 0), end: iso(1, 14, 0) }],
    },
    durationMinutes: 30,
    assertions: {
      minSlotsFound: 1,
      mustNotOverlap: [{ start: iso(1, 13, 0), end: iso(1, 14, 0) }],
    },
  },
  {
    name: "fully-booked-day",
    description: "Attendee is booked 9am-6pm every weekday for the next 2 weeks — expect zero slots in a 1-day window.",
    busyByAttendee: {
      organizer: Array.from({ length: 14 }).map((_, i) => ({
        start: iso(i, 9, 0),
        end: iso(i, 18, 0),
      })),
    },
    durationMinutes: 30,
    deadline: iso(1, 23, 59),
    assertions: {
      expectNoSlots: true,
    },
  },
  {
    name: "back-to-back-meetings-leave-no-room",
    description: "Two adjacent meetings with zero gap between them — a 60min slot must not fit in the seam.",
    busyByAttendee: {
      organizer: [
        { start: iso(2, 10, 0), end: iso(2, 11, 0) },
        { start: iso(2, 11, 0), end: iso(2, 12, 0) },
      ],
    },
    durationMinutes: 60,
    assertions: {
      mustNotOverlap: [
        { start: iso(2, 10, 0), end: iso(2, 11, 0) },
        { start: iso(2, 11, 0), end: iso(2, 12, 0) },
      ],
    },
  },
  {
    name: "duration-longer-than-any-gap",
    description: "Only 15-minute gaps exist but a 120-minute meeting is requested — expect zero valid slots.",
    busyByAttendee: {
      organizer: [
        { start: iso(3, 9, 0), end: iso(3, 10, 45) },
        { start: iso(3, 11, 0), end: iso(3, 18, 0) },
      ],
    },
        durationMinutes: 120,
    earliestStart: iso(3, 0, 0),
    deadline: iso(3, 23, 59),
    assertions: {
      expectNoSlots: true,
    },
  },
];