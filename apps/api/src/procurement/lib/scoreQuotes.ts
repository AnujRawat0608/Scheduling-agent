import type { QuoteScore, SupplierQuote } from "../state.js";

export function scoreQuotes(quotes: SupplierQuote[], quantity: number): QuoteScore[] {
  const withCost = quotes.map((q) => ({
    ...q,
    totalCost: q.unitPrice * quantity + q.shippingCost,
    meetsQuantity: q.quantityAvailable >= quantity && quantity >= q.moq,
  }));

  const qualifying = withCost.filter((q) => q.meetsQuantity);
  const pool = qualifying.length > 0 ? qualifying : withCost;

  const prices = pool.map((q) => q.totalCost);
  const leadTimes = pool.map((q) => q.leadTimeDays);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minLead = Math.min(...leadTimes);
  const maxLead = Math.max(...leadTimes);

  return withCost
    .map((q) => {
      if (!q.meetsQuantity) {
        return {
          ...q,
          score: -1,
          rationale: `Cannot fulfill: needs ${quantity} units, MOQ/availability doesn't match`,
        };
      }

      const priceScore = maxPrice === minPrice ? 1 : 1 - (q.totalCost - minPrice) / (maxPrice - minPrice);
      const leadScore = maxLead === minLead ? 1 : 1 - (q.leadTimeDays - minLead) / (maxLead - minLead);
      const score = priceScore * 0.6 + leadScore * 0.4;

      const rationale =
        q.totalCost === minPrice && q.leadTimeDays === minLead
          ? "Best price AND fastest lead time"
          : q.totalCost === minPrice
            ? `Cheapest option, but ${q.leadTimeDays}d lead time`
            : q.leadTimeDays === minLead
              ? `Fastest lead time, ${(((q.totalCost - minPrice) / minPrice) * 100).toFixed(0)}% above cheapest`
              : "Balanced option";

      return { ...q, score, rationale };
    })
    .sort((a, b) => b.score - a.score);
}