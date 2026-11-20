"use client";

/**
 * Risk news for the METIS frontend.
 *
 * Two exports:
 *   <EventList events={...} />   pure display. Use it with data you already have,
 *                                e.g. the driving_events inside a /route-risk result.
 *   <RiskNewsFeed />             fetches GET /events from the risk API and shows it.
 *
 * Plain fetch + useEffect on purpose, so it works whichever react-query version
 * (or none) the app uses. Needs: react, lucide-react, Tailwind.
 */

import { useEffect, useId, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

export type RiskEvent = {
  id?: string;
  headline: string;
  summary?: string | null;
  event_type?: string | null;
  severity: number;
  event_time: string;
  source?: string | null;
  publisher?: string | null;
  url?: string | null;
  /** /route-risk driving_events may carry the link here instead of `url` */
  source_ref?: string | null;
  chokepoints?: string[];
  /** /route-risk driving_events carry a single name */
  chokepoint_name?: string | null;
};

// Links come from third-party feeds, so only ever allow http(s) (never javascript: etc).
function safeUrl(e: RiskEvent): string | null {
  const candidate = e.url ?? e.source_ref ?? null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function publisherOf(e: RiskEvent, url: string | null): string | null {
  if (e.publisher) return e.publisher;
  if (url) return new URL(url).hostname.replace(/^www\./, "");
  if (e.source === "IMF_PORTWATCH") return "IMF PortWatch";
  if (e.source === "OPEN_METEO") return "Open-Meteo";
  return e.source ?? null;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function severityBadge(severity: number): { label: string; className: string } {
  if (severity >= 5) return { label: "Critical", className: "bg-red-50 text-red-700 ring-red-200" };
  if (severity === 4) return { label: "High", className: "bg-red-50 text-red-700 ring-red-200" };
  if (severity === 3) return { label: "Moderate", className: "bg-amber-50 text-amber-700 ring-amber-200" };
  return { label: "Minor", className: "bg-gray-100 text-gray-600 ring-gray-200" };
}

export function EventList({
  events,
  emptyText = "No flagged events in this window. That does not mean there is no risk.",
  linkHoverClass = "hover:text-[#EA580C]",
}: {
  events: RiskEvent[];
  emptyText?: string;
  /** Tailwind hover colour for headline links (METIS orange by default) */
  linkHoverClass?: string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {events.map((e, i) => {
        const url = safeUrl(e);
        const badge = severityBadge(e.severity);
        const publisher = publisherOf(e, url);
        const tags = e.chokepoints?.length ? e.chokepoints : e.chokepoint_name ? [e.chokepoint_name] : [];

        return (
          <li key={e.id ?? `${e.headline}-${i}`} className="py-3">
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
              >
                {badge.label}
              </span>
              <div className="min-w-0 flex-1">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-start gap-1 text-sm font-medium text-gray-900 ${linkHoverClass}`}
                  >
                    <span>{e.headline}</span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{e.headline}</p>
                )}

                <p className="mt-0.5 text-xs text-gray-500">
                  {[publisher, timeAgo(e.event_time)].filter(Boolean).join(" · ")}
                  {tags.length > 0 && <span> · {tags.join(", ")}</span>}
                </p>

                {e.summary && <p className="mt-1 text-sm text-gray-600">{e.summary}</p>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RiskNewsFeed({
  apiBase = process.env.NEXT_PUBLIC_RISK_API_URL ?? "http://localhost:8000",
  chokepoint,
  chokepoints,
  linkHoverClass,
  collapsible = false,
  defaultOpen = false,
  hours = 72,
  minSeverity = 2,
  limit = 15,
  refreshMs = 5 * 60 * 1000,
  title = "Latest risk news",
}: {
  apiBase?: string;
  /** One chokepoint name (partial match is fine) */
  chokepoint?: string;
  /** Several names, e.g. every chokepoint on an order's lanes. Events for any of them are shown. */
  chokepoints?: string[];
  linkHoverClass?: string;
  /** Show only the header (title, count, arrow) until the user clicks it open. */
  collapsible?: boolean;
  /** Only used with `collapsible`: start expanded. */
  defaultOpen?: boolean;
  hours?: number;
  minSeverity?: number;
  limit?: number;
  refreshMs?: number;
  title?: string;
}) {
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const expanded = !collapsible || open;

  // A string, not an array, so the effect below only re-runs when the NAMES change
  // (a new array with the same names on every render would re-fetch in a loop).
  const namesKey = (chokepoints ?? (chokepoint ? [chokepoint] : [])).join("|");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const params = new URLSearchParams({
          hours: String(hours),
          min_severity: String(minSeverity),
          limit: String(limit),
        });
        namesKey.split("|").filter(Boolean).forEach((n) => params.append("chokepoint", n));

        const res = await fetch(`${apiBase}/events?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        setEvents(data.events ?? []);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Could not load risk news right now.");
      } finally {
        setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, refreshMs);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [apiBase, namesKey, hours, minSeverity, limit, refreshMs]);

  const usesPortWatch = events.some((e) => e.source === "IMF_PORTWATCH");
  const highCount = events.filter((e) => e.severity >= 4).length;
  const loaded = !loading && !error;

  const headerContent = (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {loaded && events.length > 0 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {events.length}
          </span>
        )}
        {/* Hidden critical news must not go unnoticed behind the arrow */}
        {collapsible && !expanded && loaded && highCount > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            {highCount} high severity
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
        last {hours}h
        {collapsible && (
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </span>
    </>
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex items-baseline justify-between gap-3">{headerContent}</div>
      )}

      {expanded && (
        <div id={panelId} className="mt-2">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {!loading && error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && <EventList events={events} linkHoverClass={linkHoverClass} />}

          <p className="mt-3 text-xs text-gray-400">
            Based on publicly reported events. Summaries are AI-generated from headlines and may be inaccurate.
            {usesPortWatch && " Ship traffic data: UN Global Platform; IMF PortWatch."}
          </p>
        </div>
      )}
    </section>
  );
}