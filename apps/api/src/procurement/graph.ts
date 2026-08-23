import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ProcurementState, type ProcurementStateType } from "./state.js";
import { extractProcurementRequest } from "./nodes/extractRequest.js";
import { generateRfq } from "./nodes/generateRfq.js";
import { contactSuppliers } from "./nodes/contactSuppliers.js";
import { compareQuotes } from "./nodes/compareQuotes.js";
import { humanApproval } from "./nodes/humanApproval.js";
import { confirmPurchase } from "./nodes/confirmPurchase.js";

function routeAfterCompare(state: ProcurementStateType) {
  return state.status === "failed" ? END : "humanApproval";
}

function routeAfterApproval(state: ProcurementStateType) {
  return state.status === "failed" ? END : "confirmPurchase";
}

const builder = new StateGraph(ProcurementState)
  .addNode("generateRfq", generateRfq)
  .addNode("contactSuppliers", contactSuppliers)
  .addNode("compareQuotes", compareQuotes)
  .addNode("humanApproval", humanApproval)
  .addNode("confirmPurchase", confirmPurchase)
  .addEdge(START, "generateRfq")
  .addEdge("generateRfq", "contactSuppliers")
  .addEdge("contactSuppliers", "compareQuotes")
  .addConditionalEdges("compareQuotes", routeAfterCompare, {
    humanApproval: "humanApproval",
    [END]: END,
  })
  .addConditionalEdges("humanApproval", routeAfterApproval, {
    confirmPurchase: "confirmPurchase",
    [END]: END,
  })
  .addEdge("confirmPurchase", END);

export async function buildProcurementGraph() {
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup();
  return builder.compile({ checkpointer });
}

export { extractProcurementRequest };