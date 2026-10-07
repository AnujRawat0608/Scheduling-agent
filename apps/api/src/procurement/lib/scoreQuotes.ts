import type { QuoteScore, SupplierQuote } from "../state.js";
import type { RateTable } from "./fxMath.js";
import { priceQuote } from "./pricing.js";
import { isVerifiedQuote } from "./quoteSource.js";

type Weights = { price: number; speed: number };
export const WEIGHT_PRESETS: Record<string, Weights> = {
  balanced: { price: 0.6, speed: 0.4 },
  cheapest: { price: 0.85, speed: 0.15 },
  fastest: { price: 0.2, speed: 0.8 },
};

/** An unverified quote can never score above this share of an identical verified one. */
const UNVERIFIED_TRUST = 0.8;
const DEFAULT_CONFIDENCE = 0.5;

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
      // Web pages rarely state stock or MOQ. "Unknown" must not be treated as "none".
      const stockOk = q.stockKnown === false || q.quantityAvailable >= quantity;
      const moqOk = q.moqKnown === false || quantity >= q.moq;
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

  // Baselines come from VERIFIED quotes, so one wrong scraped price can't become "the cheapest"
  // and drag every real supplier's score down. With no verified quotes, use everything.
  const verifiedQualifying = qualifying.filter((p) => isVerifiedQuote(p.q));
  const baseline = verifiedQualifying.length > 0 ? verifiedQualifying : qualifying;
  const minPrice = Math.min(...baseline.map((p) => p.pricing!.converted.total));
  const minLead = Math.min(...baseline.map((p) => p.q.leadTimeDays));

  const scored = prepared.map((p): QuoteScore => {
    if (!p.stockOk || !p.moqOk || !p.pricing) return unscored(p);

    const verified = isVerifiedQuote(p.q);
    const total = p.pricing.converted.total;
    const lead = p.q.leadTimeDays;
    const meetsDeadline = daysUntilDeadline == null || lead <= daysUntilDeadline;

    // Ratios against the best option: cheapest = 1, twice the price = 0.5.
    // Clamped to 1 so a quote beating the baseline can't score above a perfect match.
    const priceScore = total > 0 ? Math.min(1, minPrice / total) : 1;
    const leadScore = Math.min(1, (minLead + 1) / (lead + 1));
    const trust = verified ? 1 : UNVERIFIED_TRUST * (p.q.confidence ?? DEFAULT_CONFIDENCE);
    const score = (priceScore * weights.price + leadScore * weights.speed) * trust;

    const parts: string[] = [];
    parts.push(
      total <= minPrice ? "Cheapest" : `${(((total - minPrice) / minPrice) * 100).toFixed(0)}% above cheapest`
    );
    parts.push(lead <= minLead ? "fastest" : `${lead - minLead}d slower than fastest`);
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
    if (!verified) {
      parts.push(
        `unverified ${p.q.source} quote (${Math.round((p.q.confidence ?? DEFAULT_CONFIDENCE) * 100)}% confidence), confirm with the supplier`
      );
      if (p.q.leadTimeAssumed) parts.push("lead time assumed");
      if (p.q.stockKnown === false) parts.push("stock unconfirmed");
      if (p.q.moqKnown === false) parts.push("MOQ unconfirmed");
      if (p.q.shippingKnown === false) parts.push("shipping not quoted");
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

  // Only a verified, on-time quote can be "best" (best quotes feed plans and orders).
  const best = scored.find((s) => s.score >= 0 && isVerifiedQuote(s) && (s.meetsDeadline ?? true));
  if (best) best.isBest = true;
  return scored;
}