import { scoreQuotes } from "../lib/scoreQuotes.js";
import type { ProcurementStateType } from "../state.js";

export async function compareQuotes(state: ProcurementStateType) {
  const { request, quotes } = state;
  const scored = scoreQuotes(quotes, request.quantity);
  const best = scored[0];

  if (!best || best.score === 0) {
    return {
      status: "failed" as const,
      failureReason: "No supplier could fulfill the requested quantity.",
    };
  }

  return {
    scoredQuotes: scored,
    recommendedSupplier: best,
    status: "awaiting_approval" as const,
  };
}