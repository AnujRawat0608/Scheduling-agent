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
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchHit[]>;
}

class FirecrawlSearch implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchHit[]> {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: maxResults,
        scrapeOptions: { formats: ["markdown"] },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);

    const data = (await res.json()) as {
      success?: boolean;
      data?: Array<{ url: string; title?: string; description?: string; markdown?: string | null }>;
    };
    return (data.data ?? []).map((r) => ({
      url: r.url,
      title: r.title ?? r.url,
      text: r.markdown || r.description || "",
    }));
  }
}

class TavilySearch implements SearchProvider {
  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchHit[]> {
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
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Web search failed (${res.status})`);

    const data = (await res.json()) as {
      results?: Array<{ url: string; title?: string; content?: string; raw_content?: string | null }>;
    };
    return (data.results ?? []).map((r) => ({
      url: r.url,
      title: r.title ?? r.url,
      text: r.raw_content || r.content || "",
    }));
  }
}

/**
 * Prefers Firecrawl when FIRECRAWL_API_KEY is set; falls back to Tavily if only
 * TAVILY_API_KEY is set (so an existing deployment keeps working); returns null
 * when neither is configured, so web sourcing is simply unavailable.
 */
export function getSearchProvider(): SearchProvider | null {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (firecrawlKey) return new FirecrawlSearch(firecrawlKey);

  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) return new TavilySearch(tavilyKey);

  return null;
}