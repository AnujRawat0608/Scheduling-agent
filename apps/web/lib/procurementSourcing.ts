import { formatMoney } from "./format";
import type { QuoteScore, FulfillmentPlan, LineItem } from "./procurementApi";

/**
 * Finds which real fulfillment plan (if any) contains this EXACT quote for this line item.
 *
 * A plan keeps only one quote per supplier per item, so a supplier with several listings of
 * the same product has just one of them in any plan. Matching on the supplier alone would make
 * every listing from that supplier look "approved" together, so we match the quote itself:
 * supplier, unit price, currency and the listing title the supplier used.
 *
 * leg.lineItems and leg.quotes are built in the same order, so index k lines up.
 *
 * Returns null when no plan contains this exact quote. There is nothing safe to "approve"
 * for that row, so the caller falls back to Trigger Auto-RFQ instead of guessing.
 */
export function findApprovalTarget(
  lineItemName: string,
  quote: QuoteScore,
  recommendedPlan: FulfillmentPlan | null | undefined,
  alternativePlans: FulfillmentPlan[] | undefined
): { kind: "recommended" } | { kind: "alternative"; index: number } | null {
  const sameQuote = (q: QuoteScore | undefined): boolean =>
    !!q &&
    q.supplierId === quote.supplierId &&
    q.supplierName === quote.supplierName &&
    q.unitPrice === quote.unitPrice &&
    q.currency === quote.currency &&
    (q.offerItem ?? "") === (quote.offerItem ?? "");

  const matchesPlan = (plan: FulfillmentPlan) =>
    plan.legs.some((leg) =>
      leg.lineItems.some((li, k) => li.item === lineItemName && sameQuote(leg.quotes[k]))
    );

  if (recommendedPlan && matchesPlan(recommendedPlan)) return { kind: "recommended" };

  const altIndex = (alternativePlans ?? []).findIndex(matchesPlan);
  if (altIndex !== -1) return { kind: "alternative", index: altIndex };

  return null;
}

/** Builds a Mail-compose URL prefilled from this quote, for the Trigger Auto-RFQ fallback.
 *  There's no contactEmail field on SupplierQuote yet, so "to" is left blank for the buyer
 *  to fill in — add that field to light up full auto-fill. */
export function buildRfqMailHref(lineItem: LineItem, q: QuoteScore): string {
  const subject = `RFQ: ${lineItem.quantity}x ${lineItem.item}`;
  const body = [
    `Hi ${q.supplierName},`,
    "",
    `We're requesting a formal quote for ${lineItem.quantity}x ${lineItem.item}.`,
    q.offerItem && q.offerItem !== lineItem.item ? `(Matched against your listing: ${q.offerItem})` : "",
    "",
    `Your listed price was ${formatMoney(q.unitPrice, q.currency)}/unit with a lead time of ${q.leadTimeDays} days.`,
    "",
    "Could you confirm this price and lead time, and share your compliance documentation (ISO/CE/RoHS as applicable)?",
    "",
    "Thanks,",
    "Procurement team",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({ compose: "1", subject, body });
  return `/mail?${params.toString()}`;
}