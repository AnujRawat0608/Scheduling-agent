import type { QuoteScore, SupplierQuote } from "../state.js";
import type { RateTable } from "./fxMath.js";
import { priceQuote } from "./pricing.js";

type Weights = { price: number; speed: number };
export const WEIGHT_PRESETS: Record<string, Weights> = {
  balanced: { price: 0.6, speed: 0.4 },
  cheapest: { price: 0.85, speed: 0.15 },
  fastest: { price: 0.2, speed: 0.8 },
};

export function scoreQuotes(
  quotes: SupplierQuote[],
  quantity: number,
  rates: RateTable,
  buyerCurrency = "INR",
  opts: { daysUntilDeadline?: number; weights?: Weights } = {}
): QuoteScore[] {
  const weights = opts.weights ?? WEIGHT_PRESETS.balanced;
  const { daysUntilDeadline } = opts;

  const prepared = quotes.map((q) => {
    try {
      const pricing = priceQuote(q, quantity, rates, buyerCurrency);
      const stockOk = q.quantityAvailable >= quantity;
      const moqOk = quantity >= q.moq;
      return { q, pricing, stockOk, moqOk, error: null as string | null };
    } catch (err) {
      return { q, pricing: null, stockOk: false, moqOk: false, error: (err as Error).message };
    }
  });

  const qualifying = prepared.filter((p) => p.stockOk && p.moqOk && p.pricing);

  const unscored = (p: (typeof prepared)[number]): QuoteScore => ({
    ...p.q,
    totalCost: p.pricing?.converted.total ?? null, // not 0
    buyerCurrency,
    pricing: p.pricing,
    score: -1,
    isBest: false,
    rationale: p.error
      ? `Cannot price this quote: ${p.error}`
      : !p.stockOk
        ? `Only ${p.q.quantityAvailable} in stock (need ${quantity})`
        : `Minimum order is ${p.q.moq} (need ${quantity})`,
  });

  if (qualifying.length === 0) return prepared.map(unscored);

  const minPrice = Math.min(...qualifying.map((p) => p.pricing!.converted.total));
  const minLead = Math.min(...qualifying.map((p) => p.q.leadTimeDays));

  const scored = prepared.map((p): QuoteScore => {
    if (!p.stockOk || !p.moqOk || !p.pricing) return unscored(p);

    const total = p.pricing.converted.total;
    const lead = p.q.leadTimeDays;
    const meetsDeadline = daysUntilDeadline == null || lead <= daysUntilDeadline;

    // Ratios against the best option: cheapest = 1, twice the price = 0.5
    const priceScore = total > 0 ? minPrice / total : 1;
    const leadScore = (minLead + 1) / (lead + 1);
    const score = priceScore * weights.price + leadScore * weights.speed;

    const parts: string[] = [];
    parts.push(
      total === minPrice ? "Cheapest" : `${(((total - minPrice) / minPrice) * 100).toFixed(0)}% above cheapest`
    );
    parts.push(lead === minLead ? "fastest" : `${lead - minLead}d slower than fastest`);
    if (daysUntilDeadline != null) {
      const slack = daysUntilDeadline - lead;
      parts.push(
        !meetsDeadline
          ? `misses deadline by ${lead - daysUntilDeadline}d`
          : slack === 0
            ? "arrives on deadline day"
            : `arrives ${slack}d before deadline`
      );
    }

    return {
      ...p.q,
      totalCost: total,
      buyerCurrency,
      pricing: p.pricing,
      score,
      meetsDeadline,
      isBest: false,
      rationale: parts.join(" · "),
    };
  });

  // 1) usable quotes before unusable ones, 2) on-time before late, 3) higher score,
  // 4) ties: lower price, then faster.
  scored.sort((a, b) => {
    const aValid = a.score >= 0;
    const bValid = b.score >= 0;
    if (aValid !== bValid) return aValid ? -1 : 1;

    const aOn = a.meetsDeadline !== false;
    const bOn = b.meetsDeadline !== false;
    if (aOn !== bOn) return aOn ? -1 : 1;

    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
    return (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity) || a.leadTimeDays - b.leadTimeDays;
  });

  if (scored[0].score >= 0 && (scored[0].meetsDeadline ?? true)) scored[0].isBest = true;
  return scored;
}