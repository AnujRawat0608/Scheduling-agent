import { checkRouteRisk, RiskAgentUnavailableError } from "../riskAgent/client.js";
import { persistRiskAssessment } from "../../db/persistRiskAssessment.js";
import type { ProcurementStateType } from "../state.js";

/**
 * Runs after compareQuotes (recommendedSupplier is set) and before
 * humanApproval. Never fails the run — a skipped or unavailable check
 * just means no risk badge shows up for this task.
 */
export async function riskCheckNode(state: ProcurementStateType) {
  if (!state.useRiskAnalysis) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  const region = state.recommendedSupplier?.supplierRegion;
  if (!region) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  try {
    const assessment = await checkRouteRisk({ supplierRegion: region });

    if (state.taskId) {
      await persistRiskAssessment(state.taskId, assessment, true);
    }

    return { riskAssessment: assessment, riskCheckStatus: "ok" as const };
  } catch (err) {
    if (err instanceof RiskAgentUnavailableError) {
      console.warn("[riskCheckNode] risk agent unavailable, continuing run", err);
      return { riskAssessment: null, riskCheckStatus: "unavailable" as const };
    }
    throw err;
  }
}