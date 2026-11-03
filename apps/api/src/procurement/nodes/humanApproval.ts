import { interrupt } from "@langchain/langgraph";
import { logPlanDecision } from "../../db/logPlanDecision.js";
import type { ProcurementStateType, FulfillmentPlan } from "../state.js";

type ApprovalDecision =
  | { approved: true; selectedPlanIndex?: number } // index into [recommendedPlan, ...alternativePlans]; omitted = accept recommended
  | { approved: false; note: string; category?: string }; // category: price | risk | lead_time | supplier | other

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

  // NOTE: when the run resumes, LangGraph re-runs this node from the top and interrupt()
  // returns the buyer's decision. So decision logging must stay BELOW this call, or it
  // would run twice (once when pausing, once when resuming).
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
    void logPlanDecision(state, {
      approved: false,
      note: decision.note,
      category: decision.category,
    }); // fire-and-forget, never throws
    return {
      status: "failed" as const,
      failureReason: decision.note || "Purchase rejected by approver",
    };
  }

  let chosenPlan = recommendedPlan;
  let chosenPlanIndex = 0;
  if (decision.selectedPlanIndex !== undefined && decision.selectedPlanIndex > 0) {
    const chosen = alternativePlans[decision.selectedPlanIndex - 1];
    if (chosen) {
      chosenPlan = chosen;
      chosenPlanIndex = decision.selectedPlanIndex;
    }
  }

  void logPlanDecision(state, { approved: true, chosenPlan, chosenPlanIndex });

  if (chosenPlanIndex > 0) {
    return { status: "purchasing" as const, recommendedPlan: chosenPlan };
  }
  return { status: "purchasing" as const };
}