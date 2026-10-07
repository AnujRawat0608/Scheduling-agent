import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ProcurementState, type ProcurementStateType } from "./state.js";
import { extractProcurementRequest } from "./nodes/extractRequest.js";
import { contactSuppliers } from "./nodes/contactSuppliers.js";
import { webDiscovery } from "./nodes/webDiscovery.js";
import { compareQuotes } from "./nodes/compareQuotes.js";
import { riskCheckNode } from "./nodes/riskCheckNode.js";
import { humanApproval } from "./nodes/humanApproval.js";
import { sendRfqs } from "./nodes/sendRfqs.js";

// Web search is slow and costs money, so it only runs when the buyer asked for it.
function routeAfterContact(state: ProcurementStateType) {
  return (state.request.sourceMode ?? "registered") === "registered" ? "compareQuotes" : "webDiscovery";
}

// "done" here means web-only results with nothing to approve (see compareQuotes).
function routeAfterCompare(state: ProcurementStateType) {
  return state.status === "failed" || state.status === "done" ? END : "riskCheck";
}

function routeAfterApproval(state: ProcurementStateType) {
  return state.status === "failed" ? END : "sendRfqs";
}

const builder = new StateGraph(ProcurementState)
  .addNode("contactSuppliers", contactSuppliers)
  .addNode("webDiscovery", webDiscovery)
  .addNode("compareQuotes", compareQuotes)
  .addNode("riskCheck", riskCheckNode)
  .addNode("humanApproval", humanApproval)
  .addNode("sendRfqs", sendRfqs)
  .addEdge(START, "contactSuppliers")
  .addConditionalEdges("contactSuppliers", routeAfterContact, {
    compareQuotes: "compareQuotes",
    webDiscovery: "webDiscovery",
  })
  .addEdge("webDiscovery", "compareQuotes")
  .addConditionalEdges("compareQuotes", routeAfterCompare, {
    riskCheck: "riskCheck",
    [END]: END,
  })
  .addEdge("riskCheck", "humanApproval")
  .addConditionalEdges("humanApproval", routeAfterApproval, {
    sendRfqs: "sendRfqs",
    [END]: END,
  })
  .addEdge("sendRfqs", END);

export async function buildProcurementGraph() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup();
  return builder.compile({ checkpointer });
}

export { extractProcurementRequest };