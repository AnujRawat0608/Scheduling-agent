import { interrupt } from "@langchain/langgraph";
import type { ProcurementStateType, FulfillmentPlan } from "../state.js";

type ApprovalDecision =
  | { approved: true; selectedPlanIndex?: number } // index into [recommendedPlan, ...alternativePlans]; omitted = accept recommended
  | { approved: false; note: string };

function describePlan(plan: FulfillmentPlan): string {
  if (plan.legs.length === 1) {
    return `${plan.legs[0].supplierName} can fulfill this entire order for INR ${plan.totalCost.toLocaleString("en-IN")}.`;
  }
  const legSummary = plan.legs
    .map((leg) => `${leg.supplierName} (${leg.lineItems.map((li) => li.item).join(", ")})`)
    .join("; ");
  return `No single supplier covers everything. Recommended split across ${plan.legs.length} suppliers — ${legSummary}. Total: INR ${plan.totalCost.toLocaleString("en-IN")}.`;
}

export async function humanApproval(state: ProcurementStateType) {
  const { recommendedPlan, alternativePlans, lineItemQuotes } = state;

  if (!recommendedPlan) {
    return { status: "failed" as const, failureReason: "No recommendation to approve" };
  }

  const unmatchedNote =
    recommendedPlan.unmatchedItems.length > 0
      ? ` Note: no supplier was found at all for: ${recommendedPlan.unmatchedItems.map((li) => li.item).join(", ")}.`
      : "";

  const decision = interrupt({
    question: describePlan(recommendedPlan) + unmatchedNote,
    recommendation: recommendedPlan,
    alternatives: alternativePlans,
    perItemOptions: lineItemQuotes.map((liq) => ({
      item: liq.lineItem.item,
      quantity: liq.lineItem.quantity,
      hasMatch: liq.hasMatch,
      topQuotes: liq.topQuotes,
    })),
  }) as ApprovalDecision;

  if (!decision.approved) {
    return {
      status: "failed" as const,
      failureReason: decision.note || "Purchase rejected by approver",
    };
  }

  if (decision.selectedPlanIndex !== undefined && decision.selectedPlanIndex > 0) {
    const chosen = alternativePlans[decision.selectedPlanIndex - 1];
    if (chosen) {
      return { status: "purchasing" as const, recommendedPlan: chosen };
    }
  }

  return { status: "purchasing" as const };
}