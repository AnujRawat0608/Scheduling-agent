import { Annotation } from "@langchain/langgraph";

export interface Attendee {
  id: string;
  email: string;
  name?: string;
  timezone?: string;
}

export interface TimeSlot {
  start: string; // ISO 8601
  end: string; // ISO 8601
  score?: number; // 0-1, how good a fit this is
  rationale?: string;
}

export interface BusySlot {
  start: string;
  end: string;
}

export type RunStatus =
  | "gathering"
  | "proposing"
  | "awaiting_approval"
  | "sending"
  | "done"
  | "failed";

export interface SchedulingRequest {
  organizer: Attendee;
  attendees: Attendee[];
  durationMinutes: number;
  title: string;
  earliestStart?: string; // ISO date, defaults to "now"
  deadline?: string; // ISO date - must be scheduled by this date
  constraints?: string; // free text, e.g. "no mornings, prefer Tue/Thu"
    avoidMornings?: boolean;
  avoidAfternoons?: boolean;
    meetingType?: "escalation" | "customer_support" | "sales" | "interview" | "internal" | "general";
}

export interface ApprovalRequest {
  question: string;
  options: TimeSlot[];
  allowFreeform: boolean; // can the human type something else entirely
}

/**
 * LangGraph state. Each key gets a reducer — most fields are just
 * "last write wins" (default), but calendarData and errors accumulate.
 */
export const SchedulingState = Annotation.Root({
  request: Annotation<SchedulingRequest>(),

  calendarData: Annotation<Record<string, BusySlot[]>>({
    reducer: (existing, update) => ({ ...existing, ...update }),
    default: () => ({}),
  }),

  calendarErrors: Annotation<string[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),

  proposedSlots: Annotation<TimeSlot[]>({
    reducer: (_existing, update) => update,
    default: () => [],
  }),

  selectedSlot: Annotation<TimeSlot | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),

  status: Annotation<RunStatus>({
    reducer: (_existing, update) => update,
    default: () => "gathering",
  }),

  approvalRequest: Annotation<ApprovalRequest | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),

  conflictReason: Annotation<string | null>({
    reducer: (_existing, update) => update,
    default: () => null,
  }),
});

export type SchedulingStateType = typeof SchedulingState.State;
