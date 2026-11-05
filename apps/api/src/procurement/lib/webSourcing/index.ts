import type { LineItem, SupplierQuote } from "../../state.js";
import { getSearchProvider, type SearchHit } from "./search.js";
import { extractOffersFromHit } from "./extract.js";

const MAX_PAGES = Number(process.env.WEB_MAX_PAGES ?? 8);
const CONCURRENCY = Number(process.env.WEB_CONCURRENCY ?? 2);
const STEP_TIMEOUT_MS = Number(process.env.WEB_TIMEOUT_MS ?? 45_000);
const MAX_QUOTES_PER_ITEM = Number(process.env.WEB_MAX_QUOTES_PER_ITEM ?? 6);

// Optional: sites that should never be searched, comma separated (e.g. "pinterest.com,quora.com").
const EXCLUDE_DOMAINS = (process.env.WEB_EXCLUDE_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Skip pages that can't contain an offer: articles/listicles and pages with no price-like text.
// Each skipped page saves a model call (time and tokens).
const NOT_A_SHOP = /\/(blog|articles?|news|guides?|cart|searchpage|search)\b|[?&](q|k|query|keyword)=/i;
const PRICE_LIKE = /[$€£₹]|\b(usd|inr|eur|gbp|aud|cad)\b|\bprice\b/i;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** True when web sourcing is configured (a search API key exists). */
export function webSourcingAvailable(): boolean {
  return getSearchProvider() !== null;
}

/** Reads the pages that could hold an offer and returns only the quotes that pass validation. */
async function readHits(lineItem: LineItem, hits: SearchHit[]): Promise<SupplierQuote[]> {
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
  return quotes;
}

/**
 * Search the web for suppliers of one line item and return validated, unverified quotes.
 * Never throws for a bad page: failures on single pages are skipped.
 *
 * Manufacturer sites often show no prices (they link to retailers). So when the first search
 * produces no valid quote, a second search runs with a seller-oriented query and WITHOUT the
 * sites already read, to reach retailers and distributors.
 */
export async function discoverWebQuotes(lineItem: LineItem): Promise<SupplierQuote[]> {
  const provider = getSearchProvider();
  if (!provider) {
    console.warn("[webSourcing] TAVILY_API_KEY is not set; skipping web search.");
    return [];
  }

  const base = [lineItem.item, lineItem.specifications].filter(Boolean).join(" ");

  // Pass 1
  const hits1 = await withTimeout(
    provider.search(`${base} buy price supplier`, MAX_PAGES, undefined, EXCLUDE_DOMAINS),
    STEP_TIMEOUT_MS,
    "web search"
  );
  let quotes = await readHits(lineItem, hits1);

  // Pass 2: only when pass 1 found nothing usable. Skips every site already read.
  if (quotes.length === 0) {
    const tried = [...new Set(hits1.map((h) => hostOf(h.url)))];
    console.log(`[webSourcing] "${lineItem.item}": no valid quote, searching again without ${tried.join(", ") || "any site"}`);
    try {
      const hits2 = await withTimeout(
        provider.search(`${base} buy online in stock`, MAX_PAGES, undefined, [...EXCLUDE_DOMAINS, ...tried]),
        STEP_TIMEOUT_MS,
        "web search (second pass)"
      );
      quotes = await readHits(
        lineItem,
        hits2.filter((h) => !tried.includes(hostOf(h.url)))
      );
    } catch (err) {
      console.warn("[webSourcing] second search failed:", err instanceof Error ? err.message : err);
    }
  }

  console.log(`[webSourcing] "${lineItem.item}": ${quotes.length} valid quote(s) extracted`);

  // De-duplicate (same site, same price and currency), keep the most confident first.
  const seen = new Set<string>();
  return quotes
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .filter((q) => {
      const key = `${hostOf(q.sourceUrl!)}|${q.unitPrice}|${q.currency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUOTES_PER_ITEM);
}