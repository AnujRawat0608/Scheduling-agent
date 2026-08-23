import type { ProcurementStateType } from "../state.js";

export async function confirmPurchase(state: ProcurementStateType) {
  if (!state.recommendedSupplier) {
    return { status: "failed" as const, failureReason: "No confirmed supplier" };
  }
  return { status: "done" as const };
}