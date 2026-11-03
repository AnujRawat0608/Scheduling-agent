// apps/api/src/db/logPlanDecision.ts
//
// Best-effort logger: writes one clean decision record per approval or rejection.
// It NEVER throws, so a database problem can't fail a procurement run.

import { db } from "./client.js";
import { planDecisions } from "./dataMoatSchema.js";
import type { FulfillmentPlan, ProcurementStateType } from "../procurement/state.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REJECT_CATEGORIES = ["price", "risk", "lead_time", "supplier", "other"] as const;

export type RejectCategory = (typeof REJECT_CATEGORIES)[number];

type DecisionInput =
  | { approved: true; chosenPlan: FulfillmentPlan; chosenPlanIndex: number }
  | { approved: false; note?: string; category?: string };

const SCOPE_MAP = {
  registered: "registered",
  both: "registered_plus_web",
  web: "web_only",
} as const;

export async function logPlanDecision(
  state: ProcurementStateType,
  input: DecisionInput
): Promise<void> {
  try {
    if (!state.taskId) {
      console.warn("[logPlanDecision] no taskId on state, skipping");
      return;
    }

    const procurerId = state.request?.procurerId;
    const mode = state.request?.sourceMode ?? "registered";

    const base = {
      runId: state.taskId,
      buyerId: procurerId && UUID_RE.test(procurerId) ? procurerId : null,
      optionsShown: {
        recommended: state.recommendedPlan,
        alternatives: state.alternativePlans,
      },
      searchScope: SCOPE_MAP[mode] ?? "registered",
      riskCheckEnabled: state.useRiskAnalysis,
      riskStatus: state.riskCheckStatus,
    };

    if (input.approved) {
      const plan = input.chosenPlan;
      const singleSupplierId = plan.legs.length === 1 ? plan.legs[0].supplierId : null;
      await db.insert(planDecisions).values({
        ...base,
        decision: "approved",
        optionChosen: plan,
        chosenPlanIndex: input.chosenPlanIndex,
        chosenSupplierId: singleSupplierId && UUID_RE.test(singleSupplierId) ? singleSupplierId : null,
        chosenTotalValue: plan.totalCost.toFixed(2),
        chosenCurrency: "INR",
      });
    } else {
      const category = REJECT_CATEGORIES.find((c) => c === input.category) ?? null;
      await db.insert(planDecisions).values({
        ...base,
        decision: "rejected",
        rejectReason: input.note?.trim() || null,
        rejectCategory: category,
      });
    }
  } catch (err) {
    console.warn("[logPlanDecision] insert failed", err);
  }
}