import type { QuoteScore, SupplierQuote } from "../state.js";
import type { RateTable } from "./fxMath.js";
import { priceQuote } from "./pricing.js";

export function scoreQuotes(
  quotes: SupplierQuote[],
  quantity: number,
  rates: RateTable,
  buyerCurrency = "INR"
): QuoteScore[] {
  const prepared = quotes.map((q) => {
    try {
      const pricing = priceQuote(q, quantity, rates, buyerCurrency);
      const meetsQuantity = q.quantityAvailable >= quantity && quantity >= q.moq;
      return { q, pricing, meetsQuantity, error: null as string | null };
    } catch (err) {
      return { q, pricing: null, meetsQuantity: false, error: (err as Error).message };
    }
  });

  const qualifying = prepared.filter((p) => p.meetsQuantity && p.pricing);

  const unscored = (p: (typeof prepared)[number]): QuoteScore => ({
    ...p.q,
    totalCost: p.pricing?.converted.total ?? 0,
    buyerCurrency,
    pricing: p.pricing,
    score: -1,
    isBest: false,
    rationale: p.error
      ? `Cannot price this quote: ${p.error}`
      : `Cannot fulfill: needs ${quantity} units, MOQ/availability doesn't match`,
  });

  if (qualifying.length === 0) return prepared.map(unscored);

  const prices = qualifying.map((p) => p.pricing!.converted.total);
  const leadTimes = qualifying.map((p) => p.q.leadTimeDays);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minLead = Math.min(...leadTimes);
  const maxLead = Math.max(...leadTimes);

  return prepared
    .map((p): QuoteScore => {
      if (!p.meetsQuantity || !p.pricing) return unscored(p);

      const totalCost = p.pricing.converted.total;
      const priceScore = maxPrice === minPrice ? 1 : 1 - (totalCost - minPrice) / (maxPrice - minPrice);
      const leadScore = maxLead === minLead ? 1 : 1 - (p.q.leadTimeDays - minLead) / (maxLead - minLead);
      const score = priceScore * 0.6 + leadScore * 0.4;

      const isCheapest = totalCost === minPrice;
      const isFastest = p.q.leadTimeDays === minLead;
      const rationale =
        isCheapest && isFastest
          ? "Best price AND fastest lead time"
          : isCheapest
            ? `Cheapest option, but ${p.q.leadTimeDays}d lead time`
            : isFastest
              ? minPrice > 0
                ? `Fastest lead time, ${(((totalCost - minPrice) / minPrice) * 100).toFixed(0)}% above cheapest`
                : "Fastest lead time"
              : "Balanced option";

      return {
        ...p.q,
        totalCost,
        buyerCurrency,
        pricing: p.pricing,
        score,
        rationale,
        isBest: isCheapest && isFastest,
      };
    })
    .sort((a, b) => b.score - a.score);
}