import { interrupt } from "@langchain/langgraph";
import type { SchedulingStateType, TimeSlot } from "../state.js";

/**
 * This is the pause point. `interrupt()` halts graph execution and
 * persists state via the Postgres checkpointer — the process can exit
 * entirely here. When the API layer later calls `graph.invoke(resumeValue,
 * { configurable: { thread_id } })` with the human's choice, execution
 * picks back up right here with `resumeValue` as this call's return value.
 *
 * We always route through this node before sendInvites — even a
 * "clean" run with an obvious best slot still gets a human's eyes on
 * it before an invite goes out to other people's calendars.
 */
export async function humanApproval(state: SchedulingStateType) {
  const decision = interrupt<
    { question: string; options: TimeSlot[]; warnings: string[] },
    { selectedSlot: TimeSlot } | { reject: true; note: string }
  >({
    question: state.approvalRequest?.question ?? "Confirm a time",
    options: state.proposedSlots,
    warnings: state.calendarErrors,
  });

  if ("reject" in decision) {
    return {
      status: "failed" as const,
      conflictReason: decision.note,
    };
  }

  return {
    selectedSlot: decision.selectedSlot,
    status: "sending" as const,
    approvalRequest: null,
  };
}
