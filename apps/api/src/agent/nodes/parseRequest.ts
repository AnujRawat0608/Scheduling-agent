import type { SchedulingStateType } from "../state.js";

export async function parseRequest(state: SchedulingStateType) {
  const { request } = state;

  const missing: string[] = [];
  if (!request.durationMinutes) missing.push("durationMinutes");
  if (!request.title) missing.push("title");
  if (!request.organizer?.email) missing.push("organizer.email");
  if (!request.attendees || request.attendees.length === 0) missing.push("attendees");

  if (missing.length > 0) {
    return {
      status: "awaiting_approval" as const,
      approvalRequest: {
        question: `Request is missing required fields: ${missing.join(", ")}. Please resubmit with these included.`,
        options: [],
        allowFreeform: false,
      },
    };
  }

  return { status: "gathering" as const };
}