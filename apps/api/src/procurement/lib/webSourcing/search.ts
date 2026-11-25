/**
 * Search provider abstraction. Swap providers by implementing SearchProvider.
 *
 * Firecrawl's /search endpoint returns full page content (markdown) with each
 * result when scrapeOptions.formats includes "markdown", so this server never
 * fetches arbitrary URLs itself (no SSRF surface, no robots.txt handling here)
 * — same reasoning as the previous Tavily integration.
 * Check Firecrawl's current API docs for the exact request fields before going live.
 */
export interface SearchHit {
  url: string;
  title: string;
  /** Page text (markdown) when scraping succeeded, else the provider's description/snippet. */
  text: string;
}

export interface SearchProvider {
  /**
   * excludeDomains: hostnames to leave out of the results (e.g. "sandisk.com"). Subdomains are
   * excluded too. Tavily is told directly; for every provider the results are also filtered
   * here, so the exclusion holds even if the provider ignores it.
   */
  search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
    excludeDomains?: string[]
  ): Promise<SearchHit[]>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function cleanDomains(domains?: string[]): string[] {
  return [...new Set((domains ?? []).map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean))];
}

function isExcluded(url: string, excluded: string[]): boolean {
  const host = hostOf(url);
  return excluded.some((d) => host === d || host.endsWith(`.${d}`));
}

class FirecrawlSearch implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
    excludeDomains?: string[]
  ): Promise<SearchHit[]> {
    const excluded = cleanDomains(excludeDomains);
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        // Ask for a few extra when we are going to filter some out, so exclusions don't shrink the list.
        limit: excluded.length > 0 ? Math.min(maxResults + 5, 20) : maxResults,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);

    const data = (await res.json()) as {
      success?: boolean;
      data?: Array<{ url: string; title?: string; description?: string; markdown?: string | null }>;
    };
    return (data.data ?? [])
      .filter((r) => !isExcluded(r.url, excluded))
      .slice(0, maxResults)
      .map((r) => ({
        url: r.url,
        title: r.title ?? r.url,
        text: r.markdown || r.description || "",
      }));
  }
}

class TavilySearch implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
    excludeDomains?: string[]
  ): Promise<SearchHit[]> {
    const excluded = cleanDomains(excludeDomains);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_raw_content: "text",
        // Tavily accepts up to 150 excluded domains.
        ...(excluded.length > 0 ? { exclude_domains: excluded.slice(0, 150) } : {}),
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);

    const data = (await res.json()) as {
      results?: Array<{ url: string; title?: string; content?: string; raw_content?: string | null }>;
    };
    return (data.results ?? [])
      .filter((r) => !isExcluded(r.url, excluded))
      .map((r) => ({
        url: r.url,
        title: r.title ?? r.url,
        text: r.raw_content || r.content || "",
      }));
  }
}

const PER_PROVIDER_TIMEOUT_MS = Number(process.env.WEB_PROVIDER_TIMEOUT_MS ?? 40_000);

/** Tries each provider in order and adds its results after the previous ones. */
class SequentialSearch implements SearchProvider {
  constructor(private readonly providers: { name: string; provider: SearchProvider }[]) {}

async search(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
  excludeDomains?: string[]
): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const seen = new Set<string>();

  for (const { name, provider } of this.providers) {
    // Caller cancelled: stop here instead of starting the next provider.
    if (signal?.aborted) break;

    // Aborts when EITHER the caller cancels OR this provider's own timeout passes.
    const timeout = AbortSignal.timeout(PER_PROVIDER_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const hits = await provider.search(query, maxResults, combined, excludeDomains);
      let added = 0;
      for (const hit of hits) {
        const key = hit.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(hit);
        added++;
      }
      console.log(`[webSourcing] ${name}: ${hits.length} result(s), ${added} new`);
    } catch (err) {
      if (signal?.aborted) break; // cancelled on purpose, not a provider failure
      console.warn(`[webSourcing] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}
}


/**
 * Uses every provider that has an API key, one after another, in this order:
 * Firecrawl, then Tavily. One key = that provider alone. No keys = null, so web
 * sourcing is simply unavailable.
 */
export function getSearchProvider(): SearchProvider | null {
  const providers: { name: string; provider: SearchProvider }[] = [];
  // Order = the order they run in. Put your preferred provider first.
  if (process.env.FIRECRAWL_API_KEY) providers.push({ name: "Firecrawl", provider: new FirecrawlSearch(process.env.FIRECRAWL_API_KEY) });
  if (process.env.TAVILY_API_KEY) providers.push({ name: "Tavily", provider: new TavilySearch(process.env.TAVILY_API_KEY) });

  if (providers.length === 0) return null;
  return providers.length === 1 ? providers[0].provider : new SequentialSearch(providers);
}