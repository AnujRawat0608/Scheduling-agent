import { formatMoney } from "./format";
import type { QuoteScore, FulfillmentPlan, LineItem } from "./procurementApi";

/**
 * Finds which real fulfillment plan (if any) actually uses this exact
 * supplier for this exact line item. Matching on supplierId AND
 * supplierName (not supplierId alone) because supplierId is null for
 * every simulated/web-sourced quote — matching on null alone would let
 * unrelated simulated suppliers collide.
 *
 * Returns null when no plan uses this supplier/item combination, which
 * means there is nothing safe to "approve" for this row — the caller
 * should fall back to Trigger Auto-RFQ instead of guessing.
 */
export function findApprovalTarget(
  lineItemName: string,
  quote: QuoteScore,
  recommendedPlan: FulfillmentPlan | null | undefined,
  alternativePlans: FulfillmentPlan[] | undefined
): { kind: "recommended" } | { kind: "alternative"; index: number } | null {
  const matchesPlan = (plan: FulfillmentPlan) =>
    plan.legs.some(
      (leg) =>
        leg.supplierId === quote.supplierId &&
        leg.supplierName === quote.supplierName &&
        leg.lineItems.some((li) => li.item === lineItemName)
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