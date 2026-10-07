import type { ProcurementStateType, LineItemQuotes } from "../state.js";
import { discoverWebQuotes } from "../lib/webSourcing/index.js";

// "Axme Electronic Pvt Ltd" and "axme electronic" should count as the same company.
const COMPANY_SUFFIXES = /\b(pvt|private|ltd|limited|inc|llc|co|corp|corporation|gmbh|llp)\b\.?/g;
const normName = (s: string) =>
  s.toLowerCase().replace(COMPANY_SUFFIXES, "").replace(/[^a-z0-9]/g, "");

/**
 * Adds web-found quotes next to the registered ones. A failure here must never break the
 * request: registered results are already in state, so errors are logged and skipped.
 */
export async function webDiscovery(state: ProcurementStateType) {
  const mode = state.request.sourceMode ?? "registered";
  if (mode === "registered") return { status: "comparing" as const };

  const lineItemQuotes: LineItemQuotes[] = await Promise.all(
    state.lineItemQuotes.map(async (liq) => {
      let web: Awaited<ReturnType<typeof discoverWebQuotes>> = [];
      try {
        web = await discoverWebQuotes(liq.lineItem);
      } catch (err) {
        console.error(`[webDiscovery] "${liq.lineItem.item}" failed:`, err);
      }

      // Skip web results that are really a registered supplier we already have a quote from.
      const known = new Set(liq.quotes.map((q) => normName(q.supplierName)));
      const fresh = web.filter((q) => !known.has(normName(q.supplierName)));

      const quotes = [...liq.quotes, ...fresh];
      return { ...liq, quotes, hasMatch: quotes.length > 0 };
    })
  );

  return { lineItemQuotes, status: "comparing" as const };
}