import type { LineItem, SupplierQuote } from "../../state.js";
import { getSearchProvider, type SearchHit } from "./search.js";
import { extractOffersFromHit } from "./extract.js";

const MAX_PAGES = Number(process.env.WEB_MAX_PAGES ?? 8);
const CONCURRENCY = Number(process.env.WEB_CONCURRENCY ?? 2);
const STEP_TIMEOUT_MS = Number(process.env.WEB_TIMEOUT_MS ?? 45_000);
const EXTRACT_TIMEOUT_MS = Number(process.env.WEB_EXTRACT_TIMEOUT_MS ?? 180_000);
const MAX_QUOTES_PER_ITEM = Number(process.env.WEB_MAX_QUOTES_PER_ITEM ?? 6);
// A second search runs when the first one finds fewer valid quotes than this.
const MIN_QUOTES = Number(process.env.WEB_MIN_QUOTES ?? 3);
// Added to the search queries so results lean towards suppliers in the buyer's region (e.g. "India").
const REGION = (process.env.WEB_REGION ?? "").trim();

// Optional: sites that should never be searched, comma separated (e.g. "pinterest.com,quora.com").
const EXCLUDE_DOMAINS = (process.env.WEB_EXCLUDE_DOMAINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Skip pages that can't contain an offer: articles/listicles and pages with no price-like text.
// Each skipped page saves a model call (time and tokens).
const NOT_A_SHOP = /\/(blog|articles?|news|guides?|cart|searchpage|search)\b|[?&](q|k|query|keyword)=/i;
const PRICE_LIKE = /[$€£₹]|\b(?:rs|inr)\.?\s?\d|\b(usd|inr|eur|gbp|aud|cad)\b|\bprice\b/i;

/**
 * Runs `fn` with an AbortSignal that fires after `ms`. On timeout the underlying request is
 * cancelled (not just ignored), so it stops using credits and connections.
 */
function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal)
    .catch((err) => {
      if (controller.signal.aborted) throw new Error(`${label} timed out after ${ms}ms`);
      throw err;
    })
    .finally(() => clearTimeout(timer));
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
      batch.map((hit) =>
        withTimeout(() => extractOffersFromHit(lineItem, hit), EXTRACT_TIMEOUT_MS, `extract ${hit.url}`)
      )
    );
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled") quotes.push(...r.value);
      else {
        // The URL is logged so a lost page can be traced.
        console.warn(`[webSourcing] ${batch[idx].url}:`, r.reason instanceof Error ? r.reason.message : r.reason);
      }
    });
  }
  return quotes;
}

/**
 * Search the web for suppliers of one line item and return validated, unverified quotes.
 * Never throws for a bad page: failures on single pages are skipped.
 *
 * Manufacturer sites often show no prices (they link to retailers). So when the first search
 * finds fewer than MIN_QUOTES valid quotes, a second search runs with a seller-oriented query
 * and WITHOUT the sites already read, to reach retailers and distributors. Its quotes are
 * ADDED to the first pass's quotes.
 *
 * The search timeout is doubled because several providers can run one after another
 * (each has its own limit inside SequentialSearch).
 */
export async function discoverWebQuotes(lineItem: LineItem): Promise<SupplierQuote[]> {
  const provider = getSearchProvider();
  if (!provider) {
    console.warn("[webSourcing] No search API key set (FIRECRAWL_API_KEY or TAVILY_API_KEY); skipping web search.");
    return [];
  }

  const base = [lineItem.item, lineItem.specifications].filter(Boolean).join(" ");

  // Pass 1. If the search itself fails, carry on with no hits so pass 2 can still try.
  let hits1: SearchHit[] = [];
  try {
    hits1 = await withTimeout(
      (signal) =>
        provider.search(`${base} buy price ${REGION}`.trim(), MAX_PAGES, signal, EXCLUDE_DOMAINS),
      STEP_TIMEOUT_MS * 2,
      "web search"
    );
  } catch (err) {
    console.warn("[webSourcing] first search failed:", err instanceof Error ? err.message : err);
  }
  let quotes = await readHits(lineItem, hits1);

  // Pass 2: only when pass 1 found fewer than MIN_QUOTES. Skips every site already read.
  if (quotes.length < MIN_QUOTES) {
    const tried = [...new Set(hits1.map((h) => hostOf(h.url)))];
    console.log(
      `[webSourcing] "${lineItem.item}": only ${quotes.length} quote(s), searching again without ${tried.join(", ") || "any site"}`
    );
    try {
      const hits2 = await withTimeout(
        (signal) =>
          provider.search(`${base} ${REGION} distributor in stock`.replace(/\s+/g, " ").trim(), MAX_PAGES, signal, [
            ...EXCLUDE_DOMAINS,
            ...tried,
          ]),
        STEP_TIMEOUT_MS * 2,
        "web search (second pass)"
      );
      const more = await readHits(
        lineItem,
        hits2.filter((h) => !tried.includes(hostOf(h.url)))
      );
      quotes = [...quotes, ...more]; // add to pass 1 results, don't replace them
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