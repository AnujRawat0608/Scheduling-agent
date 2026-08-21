import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { SchedulingState, type SchedulingStateType } from "./state.js";
import { parseRequest } from "./nodes/parseRequest.js";
import { fetchCalendars } from "./nodes/fetchCalendars.js";
import { proposeSlots } from "./nodes/proposeSlots.js";
import { humanApproval } from "./nodes/humanApproval.js";
import { sendInvites } from "./nodes/sendInvites.js";

function routeAfterApproval(state: SchedulingStateType) {
  if (state.status === "failed") return END;
  return "sendInvites";
}

function routeAfterSend(state: SchedulingStateType) {
  // A send failure due to a stale slot (someone double-booked between
  // proposal and send) loops back to re-propose rather than dying —
  // sendInvites sets conflictReason to signal this specific case.
  if (state.status === "failed" && state.conflictReason?.includes("Failed to create event")) {
    return "proposeSlots";
  }
  return END;
}

const builder = new StateGraph(SchedulingState)
  .addNode("parseRequest", parseRequest)
  .addNode("fetchCalendars", fetchCalendars)
  .addNode("proposeSlots", proposeSlots)
  .addNode("humanApproval", humanApproval)
  .addNode("sendInvites", sendInvites)
  .addEdge(START, "parseRequest")
  .addEdge("parseRequest", "fetchCalendars")
  .addEdge("fetchCalendars", "proposeSlots")
  .addEdge("proposeSlots", "humanApproval")
  .addConditionalEdges("humanApproval", routeAfterApproval, {
    sendInvites: "sendInvites",
    [END]: END,
  })
  .addConditionalEdges("sendInvites", routeAfterSend, {
    proposeSlots: "proposeSlots",
    [END]: END,
  });

/**
 * Call once at startup. The Postgres checkpointer is what makes
 * `interrupt()` in humanApproval survive process restarts — state is
 * durably persisted, not just held in memory.
 */
export async function buildGraph() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup(); // creates checkpoint tables if missing

  return builder.compile({ checkpointer });
}
