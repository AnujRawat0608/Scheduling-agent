import type { ProcurementStateType, PurchaseConfirmation } from "../state.js";

export async function confirmPurchase(state: ProcurementStateType) {
  const { recommendedPlan } = state;

  if (!recommendedPlan || recommendedPlan.legs.length === 0) {
    return { status: "failed" as const, failureReason: "No confirmed supplier plan to purchase from." };
  }

  const confirmedAt = new Date().toISOString();

  const purchaseConfirmations: PurchaseConfirmation[] = recommendedPlan.legs.map((leg) => ({
    supplierName: leg.supplierName,
    supplierId: leg.supplierId,
    lineItems: leg.lineItems,
    confirmedCost: leg.legCost,
    confirmedAt,
  }));

  return { purchaseConfirmations, status: "done" as const };
}