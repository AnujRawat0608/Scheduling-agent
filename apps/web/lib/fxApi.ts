import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Keep in sync with the API's supported currencies.
export const DISPLAY_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

const STORAGE_KEY = "procurement:display-currency";

export interface FxRates {
  base: "USD";
  /** Units of each currency that equal 1 USD. */
  rates: Record<string, number>;
  /** When the oldest rate was fetched (ISO string). */
  fetchedAt: string;
}

export async function fetchFxRates(): Promise<FxRates> {
  const res = await fetch(`${API_BASE}/fx-rates`);
  if (!res.ok) throw new Error("Failed to load exchange rates");
  return res.json();
}

/** Rates are refetched every 5 minutes; the source itself only updates a few times a day. */
export function useFxRates() {
  return useQuery({
    queryKey: ["fx-rates"],
    queryFn: fetchFxRates,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Convert between currencies using the USD-based table.
 * Returns null if either rate is missing - the caller should then fall back to the
 * original amount instead of guessing.
 */
export function convertAmount(
  fx: FxRates | undefined,
  amount: number,
  from: string,
  to: string
): number | null {
  if (from === to) return amount;
  const fromPerUsd = fx?.rates[from];
  const toPerUsd = fx?.rates[to];
  if (!fromPerUsd || !toPerUsd) return null;
  return Math.round((amount / fromPerUsd) * toPerUsd * 100) / 100;
}

/** The buyer's chosen display currency, remembered in this browser. */
export function useDisplayCurrency(defaultCurrency = "INR") {
  const [currency, setCurrencyState] = useState(defaultCurrency);

  // Read the saved choice after mount so server and client render the same first paint.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DISPLAY_CURRENCIES.includes(saved)) setCurrencyState(saved);
    } catch {
      // storage unavailable (private mode etc.) - keep the default
    }
  }, []);

  function setCurrency(next: string) {
    setCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return [currency, setCurrency] as const;
}