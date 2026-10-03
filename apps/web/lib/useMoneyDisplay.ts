import { formatMoney } from "./format";
import { useFxRates, useDisplayCurrency, convertAmount } from "./fxApi";
import type { QuoteScore } from "./procurementApi";

/**
 * Display-currency helpers for procurement quotes.
 *
 * The backend ranks and sums everything in the buyer currency (INR). This hook only
 * changes how amounts are SHOWN, so switching currency never changes the ranking.
 */
export function useMoneyDisplay(buyerCurrency = "INR") {
  const { data: fx } = useFxRates();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency(buyerCurrency);

  /** Show an amount (in currency `from`) in the chosen display currency.
   *  If a rate is missing it falls back to the original currency, correctly labelled. */
  function money(amount: number, from: string): string {
    const converted = convertAmount(fx, amount, from, displayCurrency);
    return converted === null ? formatMoney(amount, from) : formatMoney(converted, displayCurrency);
  }

  /** A line of a quote's price breakdown in the display currency.
   *  When the display currency is the buyer currency, use the server's own numbers
   *  so they match the plan card and the saved total exactly. */
  function quoteAmount(q: QuoteScore, field: "total" | "taxAmount" | "shipping"): string {
    if (!q.pricing) return money(q.totalCost, q.buyerCurrency);
    if (displayCurrency === q.pricing.buyerCurrency) {
      return formatMoney(q.pricing.converted[field], q.pricing.buyerCurrency);
    }
    return money(q.pricing.local[field], q.pricing.supplierCurrency);
  }

  /** "≈ ..." text for under the supplier's own unit price, or null if there is nothing to add. */
  function unitApprox(q: QuoteScore): string | null {
    if (displayCurrency === q.currency) return null;
    if (q.pricing && displayCurrency === q.pricing.buyerCurrency) {
      return formatMoney(q.pricing.unitPriceConverted, q.pricing.buyerCurrency);
    }
    const converted = convertAmount(fx, q.unitPrice, q.currency, displayCurrency);
    return converted === null ? null : formatMoney(converted, displayCurrency);
  }

  /** "1 USD = 96.379 INR" style rate note, or null if the currencies match or a rate is missing. */
  function rateLine(q: QuoteScore): string | null {
    if (displayCurrency === q.currency) return null;
    let rate: number | null = null;
    if (q.pricing && displayCurrency === q.pricing.buyerCurrency) {
      rate = q.pricing.fxRate;
    } else if (fx?.rates[q.currency] && fx.rates[displayCurrency]) {
      rate = fx.rates[displayCurrency] / fx.rates[q.currency];
    }
    if (rate === null) return null;
    return `1 ${q.currency} = ${rate.toLocaleString("en-US", { maximumSignificantDigits: 5 })} ${displayCurrency}`;
  }

  /** Small grey line under a total: tax, shipping and the rate used. Empty if the quote has no breakdown. */
  function quoteDetail(q: QuoteScore): string {
    if (!q.pricing) return "";
    const parts: string[] = [];
    if (q.pricing.converted.taxAmount > 0) {
      parts.push(`${q.pricing.taxInclusive ? "incl." : "+"} ${quoteAmount(q, "taxAmount")} tax`);
    }
    parts.push(q.pricing.converted.shipping > 0 ? `${quoteAmount(q, "shipping")} shipping` : "free shipping");
    const rl = rateLine(q);
    if (rl) parts.push(rl);
    return parts.join(" · ");
  }

  const ratesAsOf = fx
    ? new Date(fx.fetchedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return {
    fx,
    displayCurrency,
    setDisplayCurrency,
    ratesAsOf,
    money,
    quoteAmount,
    unitApprox,
    rateLine,
    quoteDetail,
  };
}