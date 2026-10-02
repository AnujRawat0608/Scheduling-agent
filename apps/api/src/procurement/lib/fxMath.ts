export type RateTable = Map<string, number>; // currency -> units per 1 USD

/** Convert between currencies. Throws if either rate is missing - never guesses 1:1. */
export function convert(
  rates: RateTable,
  amount: number,
  from: string,
  to: string
): { amount: number; rate: number } {
  if (from === to) return { amount, rate: 1 };
  const fromPerUsd = rates.get(from);
  const toPerUsd = rates.get(to);
  if (!fromPerUsd || !toPerUsd) {
    throw new Error(`No exchange rate available for ${!fromPerUsd ? from : to}`);
  }
  const rate = toPerUsd / fromPerUsd;
  return { amount: amount * rate, rate };
}