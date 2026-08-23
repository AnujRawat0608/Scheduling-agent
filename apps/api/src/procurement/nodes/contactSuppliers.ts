import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType } from "../state.js";

export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;
  const quotes = fetchSimulatedSupplierQuotes(request.item, request.quantity);
  return { quotes, status: "comparing" as const };
}