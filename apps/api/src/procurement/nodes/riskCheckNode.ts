import { checkRouteRisk, RiskAgentUnavailableError } from "../riskAgent/client.js";
import { persistRiskAssessment } from "../../db/persistRiskAssessment.js";
import type { RouteRiskResponse } from "../riskAgent/types.js";
import type { ProcurementStateType } from "../state.js";


const norm = (s: string) => s.trim().toLowerCase();

/**
 * Runs after compareQuotes (recommendedPlan is set) and before humanApproval.
 * Never fails the run: a skipped or unavailable check just means no risk badge.
 *
 * Origin = each supplier's own country (from the quote). Destination = the buyer's
 * delivery country. Neither is guessed. Domestic lanes (origin == destination) are
 * not sent to the risk agent, because chokepoint risk doesn't apply within a country.
 * Assessments are keyed by origin country. Advisory only: no effect on plan ranking.
 */


export async function riskCheckNode(state: ProcurementStateType) {
  console.log("[riskCheckNode] debug", {
    rawQuote: state.lineItemQuotes?.[0]?.quotes?.[0]?.supplierCountry,
    scoredQuote: state.lineItemQuotes?.[0]?.scoredQuotes?.[0]?.supplierCountry,
    planQuote: state.recommendedPlan?.legs?.[0]?.quotes?.[0]?.supplierCountry,
  });

  if (!state.useRiskAnalysis) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }
  // ...rest unchanged
  
  if (!state.useRiskAnalysis) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  const plan = state.recommendedPlan;
  if (!plan || plan.legs.length === 0) {
    return { riskCheckStatus: "skipped" as const, riskAssessment: null };
  }

  // TEST_DESTINATION_COUNTRY is a temporary testing fallback; remove it once the
  // route sets request.destinationCountry.
     // The buyer's own country, set by POST /procurement from their account.
   const destinationCountry = state.request?.destinationCountry?.trim();
  if (!destinationCountry) {
    console.warn("[riskCheckNode] no destination country on the request, skipping risk check");
    return { riskCheckStatus: "no_country" as const, riskAssessment: null };
  }

  // Distinct supplier countries across all legs: no point checking the same lane twice.
  const countries = [
    ...new Set(
      plan.legs
        .flatMap((leg) => leg.quotes.map((q) => q.supplierCountry?.trim()))
        .filter((c): c is string => !!c)
    ),
  ];

  if (countries.length === 0) {
    console.warn("[riskCheckNode] no supplier country on any leg, skipping risk check");
    return { riskCheckStatus: "no_country" as const, riskAssessment: null };
  }

  // Domestic lanes need no chokepoint analysis.
  const internationalCountries = countries.filter((c) => norm(c) !== norm(destinationCountry));

  if (internationalCountries.length === 0) {
    return { riskCheckStatus: "domestic" as const, riskAssessment: null };
  }

  try {
    // One failed lane shouldn't throw away the others.
    const settled = await Promise.allSettled(
      internationalCountries.map((originCountry) =>
        checkRouteRisk({
          originCountry,
          destinationCountry,
          orderId: state.taskId ?? undefined,
        })
      )
    );

    const assessments: Record<string, RouteRiskResponse> = {};
    settled.forEach((result, i) => {
      if (result.status === "fulfilled") {
        assessments[internationalCountries[i]] = result.value;
      } else {
        console.warn(
          `[riskCheckNode] lane ${internationalCountries[i]} -> ${destinationCountry} failed`,
          result.reason
        );
      }
    });

    if (Object.keys(assessments).length === 0) {
      const firstFailure = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      throw firstFailure?.reason ?? new RiskAgentUnavailableError();
    }

    // Persisting is best-effort; a DB hiccup must not fail the procurement run.
    if (state.taskId) {
      const results = await Promise.allSettled(
        Object.values(assessments).map((a) => persistRiskAssessment(state.taskId!, a, true))
      );
      for (const r of results) {
        if (r.status === "rejected") {
          console.warn("[riskCheckNode] failed to persist risk assessment", r.reason);
        }
      }
    }

    return { riskAssessment: assessments, riskCheckStatus: "ok" as const };
  } catch (err) {
    if (err instanceof RiskAgentUnavailableError) {
      console.warn("[riskCheckNode] risk agent unavailable, continuing run", err);
      return { riskAssessment: null, riskCheckStatus: "unavailable" as const };
    }
    throw err;
  }
}