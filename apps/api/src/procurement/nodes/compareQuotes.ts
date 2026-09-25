import { scoreQuotes } from "../lib/scoreQuotes.js";
import type {
  ProcurementStateType,
  LineItemQuotes,
  FulfillmentPlan,
  FulfillmentLeg,
  QuoteScore,
  LineItem,
} from "../state.js";

const MAX_COMBINATIONS = 5000; // safety cap — see note below buildAllPlans
const TOP_QUOTES_LIMIT = 5;

/** Score every line item's quotes, sort best-first, and cap a display-only top-N. */
function scoreAllLineItems(lineItemQuotes: LineItemQuotes[]): LineItemQuotes[] {
  return lineItemQuotes.map((liq) => {
    const scoredQuotes = scoreQuotes(liq.quotes, liq.lineItem.quantity);
    const sorted = [...scoredQuotes].sort((a, b) => b.score - a.score);
    const hasMatch = scoredQuotes.some((q) => q.score > 0); // ← recomputed here, not the stale pre-scoring flag
    return {
      ...liq,
      scoredQuotes,
      topQuotes: sorted.filter((q) => q.score > 0).slice(0, TOP_QUOTES_LIMIT),
      hasMatch,
    };
  });
}

/** For one item, the best viable quote per supplier (supplier -> its best quote for this item). */
function candidatesFor(liq: LineItemQuotes): Map<string, QuoteScore> {
  const bySupplier = new Map<string, QuoteScore>();
  for (const q of liq.scoredQuotes) {
    if (q.score <= 0) continue;
    const key = q.supplierId ?? q.supplierName;
    const existing = bySupplier.get(key);
    if (!existing || q.score > existing.score) bySupplier.set(key, q);
  }
  return bySupplier;
}

function legsFromAssignment(assignment: { lineItem: LineItem; quote: QuoteScore }[]): FulfillmentLeg[] {
  const bySupplier = new Map<string, FulfillmentLeg>();
  for (const { lineItem, quote } of assignment) {
    const key = quote.supplierId ?? quote.supplierName;
    if (!bySupplier.has(key)) {
      bySupplier.set(key, {
        supplierName: quote.supplierName,
        supplierId: quote.supplierId,
        lineItems: [],
        quotes: [],
        legCost: 0,
      });
    }
    const leg = bySupplier.get(key)!;
    leg.lineItems.push(lineItem);
    leg.quotes.push(quote);
    leg.legCost += quote.totalCost;
  }
  return Array.from(bySupplier.values());
}

function planFromLegs(legs: FulfillmentLeg[], unmatchedItems: LineItem[]): FulfillmentPlan {
  const totalCost = legs.reduce((sum, l) => sum + l.legCost, 0);
  const type: FulfillmentPlan["type"] =
    unmatchedItems.length > 0 ? "partial" : legs.length === 1 ? "single_supplier" : "split";

  const rationale =
    legs.length === 1
      ? `${legs[0].supplierName} can fulfill your entire order in one place.`
      : `Best combination across ${legs.length} suppliers by consolidation and cost.`;

  return { type, legs, unmatchedItems, totalCost, rationale };
}

/** Average QuoteScore.score across a plan's legs — reflects price + lead time together. */
function avgScore(plan: FulfillmentPlan): number {
  const allQuotes = plan.legs.flatMap((leg) => leg.quotes);
  if (allQuotes.length === 0) return 0;
  return allQuotes.reduce((sum, q) => sum + q.score, 0) / allQuotes.length;
}

/** Sort: fewer suppliers wins first, higher average score (price+lead time) as tiebreaker. */
function comparePlans(a: FulfillmentPlan, b: FulfillmentPlan): number {
  if (a.legs.length !== b.legs.length) return a.legs.length - b.legs.length;
  return avgScore(b) - avgScore(a); // higher score first
}

/**
 * Generate every valid one-supplier-per-item assignment across fulfillable
 * items, score each as a FulfillmentPlan, and return them sorted best-first.
 *
 * Safety cap: the number of combinations is the product of each item's
 * candidate-supplier count. For a small request (2-3 items, a handful of
 * suppliers each) this is trivial. For a large BOM this can explode
 * (e.g. 5 suppliers x 20 items = 5^20), so if the combination count would
 * exceed MAX_COMBINATIONS, we skip exhaustive search entirely and fall
 * back to a single greedy plan (best supplier per item, independently)
 * instead of hanging the process. This is a guard rail, not a redesign —
 * worth revisiting (e.g. capped beam search) if large BOMs become common.
 */
function buildAllPlans(scored: LineItemQuotes[]): { plans: FulfillmentPlan[]; capped: boolean } {
  const unmatchedItems = scored.filter((liq) => !liq.hasMatch).map((liq) => liq.lineItem);
  const fulfillable = scored.filter((liq) => liq.hasMatch);

  const perItemCandidates = fulfillable.map((liq) => [...candidatesFor(liq).entries()]);

  const combinationCount = perItemCandidates.reduce((n, cands) => n * Math.max(cands.length, 1), 1);

  if (combinationCount > MAX_COMBINATIONS) {
    const assignment = fulfillable.map((liq, i) => ({
      lineItem: liq.lineItem,
      quote: perItemCandidates[i].reduce((best, [, q]) => (q.score > best.score ? q : best), perItemCandidates[i][0][1]),
    }));
    const legs = legsFromAssignment(assignment);
    return { plans: [planFromLegs(legs, unmatchedItems)], capped: true };
  }

  const plans: FulfillmentPlan[] = [];

  function recurse(i: number, assignment: { lineItem: LineItem; quote: QuoteScore }[]) {
    if (i === fulfillable.length) {
      plans.push(planFromLegs(legsFromAssignment(assignment), unmatchedItems));
      return;
    }
    for (const [, quote] of perItemCandidates[i]) {
      assignment.push({ lineItem: fulfillable[i].lineItem, quote });
      recurse(i + 1, assignment);
      assignment.pop();
    }
  }

  recurse(0, []);
  plans.sort(comparePlans);
  return { plans, capped: false };
}

export async function compareQuotes(state: ProcurementStateType) {
  const scored = scoreAllLineItems(state.lineItemQuotes);
  const anyMatch = scored.some((liq) => liq.hasMatch);

  if (!anyMatch) {
    return {
      lineItemQuotes: scored,
      recommendedPlan: null,
      alternativePlans: [],
      status: "failed" as const,
      failureReason: "No supplier in the catalog could fulfill any of the requested items.",
    };
  }

  const { plans, capped } = buildAllPlans(scored);
  const recommendedPlan = plans[0];
  const alternativePlans = capped ? [] : plans.slice(1);

  if (capped) {
    recommendedPlan.rationale += " (Large item list — showing the best match found rather than every possible combination.)";
  } else if (recommendedPlan.legs.length === 1 && recommendedPlan.unmatchedItems.length === 0) {
    recommendedPlan.rationale = `${recommendedPlan.legs[0].supplierName} can fulfill your entire order in one place.`;
  } else if (recommendedPlan.unmatchedItems.length === 0) {
    recommendedPlan.rationale = `No single supplier covers everything — best split across ${recommendedPlan.legs.length} suppliers by consolidation and cost.`;
  }

  return {
    lineItemQuotes: scored,
    recommendedPlan,
    alternativePlans,
    status: "awaiting_approval" as const,
  };
}