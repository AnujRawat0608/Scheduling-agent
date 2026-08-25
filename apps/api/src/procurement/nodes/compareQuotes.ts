import { scoreQuotes } from "../lib/scoreQuotes.js";
import type { ProcurementStateType } from "../state.js";

export async function compareQuotes(state: ProcurementStateType) {
  const { request, quotes } = state;
  const scored = scoreQuotes(quotes, request.quantity);
  const best = scored[0];

  // Disqualified suppliers score -1, not 0 — catch any non-positive
  // score so an "all disqualified" result never gets treated as a
  // real recommendation. This is the exact moment a human is meant to
  // trust the system's judgment, so it must never present a non-viable
  // option as if it were viable.
  if (!best || best.score <= 0) {
    return {
      scoredQuotes: scored, // still show the table, so the human can see WHY nothing qualified
      recommendedSupplier: null,
      status: "failed" as const,
      failureReason:
        "No supplier in the catalog could fulfill this request (stock or minimum order size didn't match) no recommendation to approve.",
    };
  }

  return {
    scoredQuotes: scored,
    recommendedSupplier: best,
    status: "awaiting_approval" as const,
  };
}