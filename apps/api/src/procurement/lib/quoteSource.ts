import type { SupplierQuote } from "../state.js";

/**
 * "Verified" = a registered supplier's own offer. Web/catalog quotes are scraped, indicative
 * and unconfirmed: they may be shown and ranked, but never put into a plan, never marked best,
 * and never ordered through "Approve & Order" (the buyer must request a quote instead).
 */
export function isVerifiedQuote(q: Pick<SupplierQuote, "source">): boolean {
  return (q.source ?? "registered") === "registered";
}