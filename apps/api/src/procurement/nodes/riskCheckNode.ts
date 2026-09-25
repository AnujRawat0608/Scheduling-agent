import { checkRouteRisk, RiskAgentUnavailableError } from "../riskAgent/client.js";
import { persistRiskAssessment } from "../../db/persistRiskAssessment.js";
import type { ProcurementStateType } from "../state.js";

/**
 * Runs after compareQuotes (recommendedPlan is set) and before
 * humanApproval. Never fails the run — a skipped or unavailable check
 * just means no risk badge shows up for this task.
 *
 * A plan can have multiple legs (multiple suppliers, potentially
 * different regions), so this checks each leg's region independently
 * and stores the full set of assessments. This is not a scored or
 * weighted risk factor in the recommendation — per the locked
 * requirements, deeper risk-check integration is deferred.
 */
export async function riskCheckNode(state: ProcurementStateType) {
  if (!state.useRiskAnalysis) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  const plan = state.recommendedPlan;
  if (!plan || plan.legs.length === 0) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  // Distinct regions across all legs — no point checking the same region twice.
  const regions = [...new Set(plan.legs.map((leg) => leg.quotes[0]?.supplierRegion).filter((r): r is string => !!r))];

  if (regions.length === 0) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  try {
    const assessments = await Promise.all(
      regions.map((region) => checkRouteRisk({ supplierRegion: region }))
    );

    if (state.taskId) {
      await Promise.all(assessments.map((a) => persistRiskAssessment(state.taskId!, a, true)));
    }

    const riskAssessment = Object.fromEntries(regions.map((region, i) => [region, assessments[i]]));

    return { riskAssessment, riskCheckStatus: "ok" as const };
  } catch (err) {
    if (err instanceof RiskAgentUnavailableError) {
      console.warn("[riskCheckNode] risk agent unavailable, continuing run", err);
      return { riskAssessment: null, riskCheckStatus: "unavailable" as const };
    }
    throw err;
  }
}