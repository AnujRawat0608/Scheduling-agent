import { interrupt } from "@langchain/langgraph";
import { APPROVAL_THRESHOLD } from "../state.js";
import type { ProcurementStateType, QuoteScore } from "../state.js";

type ApprovalDecision =
  | { approved: true; selectedSupplier?: string }
  | { approved: false; note: string };

export async function humanApproval(state: ProcurementStateType) {
  const { recommendedSupplier, request, scoredQuotes } = state;
  if (!recommendedSupplier) {
    return { status: "failed" as const, failureReason: "No recommendation to approve" };
  }

  const totalCost = recommendedSupplier.totalCost;

  //if (totalCost < APPROVAL_THRESHOLD) {
  //  return { status: "purchasing" as const };
  //}

  const decision = interrupt({
    question: `${recommendedSupplier.supplierName} is recommended at INR ${totalCost.toLocaleString("en-IN")} for ${request.quantity}x ${request.item}. Approval required.`,
    recommendation: recommendedSupplier,
    allOptions: scoredQuotes,
  }) as ApprovalDecision;

  if (!decision.approved) {
    return {
      status: "failed" as const,
      failureReason: decision.note || "Purchase rejected by approver",
    };
  }

  // If the approver picked a different supplier than the recommendation,
  // honor that choice — human judgment overrides the algorithm's pick.
  if (decision.selectedSupplier && decision.selectedSupplier !== recommendedSupplier.supplierName) {
    const chosen = scoredQuotes.find((q) => q.supplierName === decision.selectedSupplier);
    if (chosen) {
      return { status: "purchasing" as const, recommendedSupplier: chosen };
    }
  }

  return { status: "purchasing" as const };
}