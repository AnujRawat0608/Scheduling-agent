import { scoreQuotes, WEIGHT_PRESETS } from "../lib/scoreQuotes.js";
import { getRates, type RateTable } from "../lib/fx.js";
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
const BUYER_CURRENCY = "INR";

/** Totals are in INR with 2 decimals; round after every sum so float drift can't creep in. */
const round2 = (n: number) => Math.round(n * 100) / 100;

type Priority = keyof typeof WEIGHT_PRESETS;

/**
 * Whole days from today until `requiredBy`. Date-only strings ("2026-10-12") are parsed
 * as LOCAL dates so the day doesn't shift with the server's timezone.
 * Returns undefined when there is no usable deadline (then nothing is judged against it).
 */
function daysUntil(requiredBy?: string | null): number | undefined {
  if (!requiredBy) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(requiredBy);
  const due = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(requiredBy);
  if (Number.isNaN(due.getTime())) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** Score every line item's quotes and cap a display-only top-N. */
function scoreAllLineItems(
  lineItemQuotes: LineItemQuotes[],
  rates: RateTable,
  opts: { daysUntilDeadline?: number; weights: (typeof WEIGHT_PRESETS)[Priority] }
): LineItemQuotes[] {
  return lineItemQuotes.map((liq) => {
    const scoredQuotes = scoreQuotes(liq.quotes, liq.lineItem.quantity, rates, BUYER_CURRENCY, opts);
    // scoreQuotes already returns on-time quotes first, then by score. Do NOT re-sort by
    // score here, or a cheap late quote would jump back above an on-time one.
    // score -1 means "cannot fulfill / cannot price"; 0 is a valid (worst-ranked) quote.
    const hasMatch = scoredQuotes.some((q) => q.score >= 0);
    return {
      ...liq,
      scoredQuotes,
      topQuotes: scoredQuotes.filter((q) => q.score >= 0).slice(0, TOP_QUOTES_LIMIT),
      hasMatch,
    };
  });
}

/** For one item, the best viable quote per supplier (supplier -> its best quote for this item). */
function candidatesFor(liq: LineItemQuotes): Map<string, QuoteScore> {
  const bySupplier = new Map<string, QuoteScore>();
  for (const q of liq.scoredQuotes) {
    if (q.score < 0) continue; // only skip unfulfillable quotes (-1), not a valid score of 0
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
    // Unpriced quotes have score -1 and are filtered out in candidatesFor, so this should
    // never fire. If it does, something upstream is wrong and we want to know.
    if (quote.totalCost === null) {
      throw new Error(`Cannot add unpriced quote from ${quote.supplierName} to a plan`);
    }
    leg.legCost = round2(leg.legCost + quote.totalCost);
  }
  return Array.from(bySupplier.values());
}

/** True when every quote in the plan arrives by the deadline (or there is no deadline). */
function planMeetsDeadline(plan: FulfillmentPlan): boolean {
  return plan.legs.every((leg) => leg.quotes.every((q) => q.meetsDeadline !== false));
}

function planFromLegs(legs: FulfillmentLeg[], unmatchedItems: LineItem[]): FulfillmentPlan {
  const totalCost = round2(legs.reduce((sum, l) => sum + l.legCost, 0));
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

/**
 * Sort order:
 *  1. plans that meet the deadline come first
 *  2. fewer suppliers
 *  3. higher average score (price + lead time)
 *  4. lower total cost (final tiebreaker, so identical scores are deterministic)
 */
function comparePlans(a: FulfillmentPlan, b: FulfillmentPlan): number {
  const onTime = Number(planMeetsDeadline(b)) - Number(planMeetsDeadline(a));
  if (onTime !== 0) return onTime;
  if (a.legs.length !== b.legs.length) return a.legs.length - b.legs.length;
  const score = avgScore(b) - avgScore(a);
  if (Math.abs(score) > 1e-9) return score;
  return a.totalCost - b.totalCost;
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
    // Greedy fallback: prefer on-time quotes, then the highest score.
    const assignment = fulfillable.map((liq, i) => ({
      lineItem: liq.lineItem,
      quote: perItemCandidates[i].reduce((best, [, q]) => {
        const qOn = q.meetsDeadline !== false;
        const bOn = best.meetsDeadline !== false;
        if (qOn !== bOn) return qOn ? q : best;
        return q.score > best.score ? q : best;
      }, perItemCandidates[i][0][1]),
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
  const rates = await getRates();

  // Deadline and priority come from the request. Unknown/missing priority falls back to balanced.
  const daysUntilDeadline = daysUntil(state.request?.requiredBy);
  const requested = state.request?.priority as Priority | undefined;
  const weights = (requested && WEIGHT_PRESETS[requested]) || WEIGHT_PRESETS.balanced;

  const scored = scoreAllLineItems(state.lineItemQuotes, rates, { daysUntilDeadline, weights });
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

  // If even the best plan is late, say so plainly instead of recommending it silently.
  if (daysUntilDeadline !== undefined && !planMeetsDeadline(recommendedPlan)) {
    recommendedPlan.rationale += " Warning: no combination of suppliers can deliver by the required date.";
  }

  return {
    lineItemQuotes: scored,
    recommendedPlan,
    alternativePlans,
    status: "awaiting_approval" as const,
  };
}