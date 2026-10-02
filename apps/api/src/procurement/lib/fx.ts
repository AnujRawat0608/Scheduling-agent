import { db } from "../../db/client.js";
import { fxRates } from "../../db/supplyChainSchema.js";
import type { RateTable } from "./fxMath.js";
export { convert } from "./fxMath.js";
export type { RateTable } from "./fxMath.js";

// Keep in sync with the list in routes/supplyChain.ts
export const SUPPORTED_CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED", "SGD"] as const;



const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_WARN_MS = 48 * 60 * 60 * 1000;

let cache: { rates: RateTable; loadedAt: number } | null = null;

/** Load all rates (cached for a few minutes). Call once per request, then pass the table around. */
export async function getRates(): Promise<RateTable> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.rates;

  const rows = await db.select().from(fxRates);
  const rates: RateTable = new Map();
  let oldest = Date.now();
  for (const r of rows) {
    rates.set(r.currency, Number(r.perUsd));
    oldest = Math.min(oldest, r.fetchedAt.getTime());
  }
  if (Date.now() - oldest > STALE_WARN_MS) {
    console.warn("[fx] some exchange rates are more than 48h old - is the refresh job running?");
  }
  cache = { rates, loadedAt: Date.now() };
  return rates;
}

export function clearRateCache() {
  cache = null;
}
