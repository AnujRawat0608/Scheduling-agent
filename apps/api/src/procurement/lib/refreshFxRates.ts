import { db } from "../../db/client.js";
import { fxRates } from "../../db/supplyChainSchema.js";
import { SUPPORTED_CURRENCIES, clearRateCache } from "./fx.js";

// Free, no-key provider covering AED as well (the ECB-based Frankfurter API doesn't).
// Check their terms (attribution) before production, and swap the URL if you prefer another provider.
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

export async function refreshFxRates(): Promise<void> {
  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) throw new Error("Unexpected response shape");

    for (const currency of SUPPORTED_CURRENCIES) {
      const perUsd = currency === "USD" ? 1 : data.rates[currency];
      if (typeof perUsd !== "number" || !Number.isFinite(perUsd) || perUsd <= 0) {
        console.warn(`[fx] skipping ${currency}: bad or missing rate`);
        continue;
      }
      await db
        .insert(fxRates)
        .values({ currency, perUsd: String(perUsd), fetchedAt: new Date() })
        .onConflictDoUpdate({
          target: fxRates.currency,
          set: { perUsd: String(perUsd), fetchedAt: new Date() },
        });
    }
    clearRateCache();
    console.log("[fx] rates refreshed");
  } catch (err) {
    // Keep the old rates. They stay usable, and getRates() warns when they get stale.
    console.error("[fx] refresh failed:", err);
  }
}

export function startFxRefreshJob(everyHours = 6) {
  void refreshFxRates(); // once at startup
  setInterval(() => void refreshFxRates(), everyHours * 60 * 60 * 1000);
}