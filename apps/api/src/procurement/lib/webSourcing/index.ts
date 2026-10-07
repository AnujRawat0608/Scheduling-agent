import type { LineItem, SupplierQuote } from "../../state.js";
import { getSearchProvider } from "./search.js";
import { extractOffersFromHit } from "./extract.js";

const MAX_PAGES = Number(process.env.WEB_MAX_PAGES ?? 8);
const CONCURRENCY = Number(process.env.WEB_CONCURRENCY ?? 2);
const STEP_TIMEOUT_MS = Number(process.env.WEB_TIMEOUT_MS ?? 45_000);
const MAX_QUOTES_PER_ITEM = Number(process.env.WEB_MAX_QUOTES_PER_ITEM ?? 6);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** True when web sourcing is configured (a search API key exists). */
export function webSourcingAvailable(): boolean {
  return getSearchProvider() !== null;
}

/**
 * Search the web for suppliers of one line item and return validated, unverified quotes.
 * Never throws for a bad page: failures on single pages are skipped.
 */
export async function discoverWebQuotes(lineItem: LineItem): Promise<SupplierQuote[]> {
  const provider = getSearchProvider();
  if (!provider) {
    console.warn("[webSourcing] TAVILY_API_KEY is not set; skipping web search.");
    return [];
  }

  const query = [lineItem.item, lineItem.specifications, "buy price supplier"].filter(Boolean).join(" ");
  const hits = await withTimeout(provider.search(query, MAX_PAGES), STEP_TIMEOUT_MS, "web search");

  // Skip pages that can't contain an offer: articles/listicles and pages with no price-like text.
  // Each skipped page saves a model call (time and tokens).
  const NOT_A_SHOP = /\/(blog|articles?|news|guides?)\//i;
  const PRICE_LIKE = /[$€£₹]|\b(usd|inr|eur|gbp|aud|cad)\b|\bprice\b/i;
  const candidates = hits.filter((h) => !NOT_A_SHOP.test(h.url) && PRICE_LIKE.test(h.text));
  console.log(`[webSourcing] "${lineItem.item}": ${hits.length} result(s), ${candidates.length} worth reading`);

  const quotes: SupplierQuote[] = [];
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((hit) => withTimeout(extractOffersFromHit(lineItem, hit), STEP_TIMEOUT_MS, `extract ${hit.url}`))
    );
    for (const r of settled) {
      if (r.status === "fulfilled") quotes.push(...r.value);
      else console.warn("[webSourcing]", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }

  console.log(`[webSourcing] "${lineItem.item}": ${quotes.length} valid quote(s) extracted`);

  // De-duplicate (same site, same price and currency), keep the most confident first.
  const seen = new Set<string>();
  return quotes
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .filter((q) => {
      const key = `${new URL(q.sourceUrl!).hostname}|${q.unitPrice}|${q.currency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUOTES_PER_ITEM);
}