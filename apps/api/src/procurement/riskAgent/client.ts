import {
  AgentRouteRiskResponseSchema,
  RouteRiskResponseSchema,
  type AgentRouteRiskResponse,
  type ChokepointStatus,
  type DrivingEvent,
  type ModeRisk,
  type RouteRiskResponse,
} from "./types.js";

// 127.0.0.1 (not localhost) avoids Node resolving to IPv6 ::1 on Windows.
// RISK_AGENT_URL must be the bare host, e.g. http://127.0.0.1:8000 (no path).
const RISK_AGENT_URL = (process.env.RISK_AGENT_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const RISK_AGENT_TIMEOUT_MS = 20000; // advisory data: fail fast, never block the order flow

export class RiskAgentUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Risk agent unavailable or timed out");
    this.name = "RiskAgentUnavailableError";
    this.cause = cause;
  }
}

interface CheckRouteRiskParams {
  originCountry: string;
  destinationCountry: string;
  orderId?: string;
}

type Color = "green" | "yellow" | "red";
type Status = Color | "unknown";

const SEVERITY_RANK: Record<Color, number> = { green: 0, yellow: 1, red: 2 };

/* ----------------------------- helpers ----------------------------- */

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

function asColor(v: unknown): Color | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase();
  return s === "green" || s === "yellow" || s === "red" ? s : null;
}

function toChokepoint(raw: unknown): ChokepointStatus | null {
  if (typeof raw === "string") {
    return { name: raw, score: null, status: null, computed_at: null };
  }
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = asString(r.name) ?? asString(r.chokepoint_name) ?? asString(r.id);
  if (!name) return null;
  return {
    name,
    score: typeof r.score === "number" ? r.score : null,
    status: asColor(r.status),
    computed_at: asString(r.computed_at),
  };
}

function toEvent(raw: unknown): DrivingEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headline = asString(r.headline) ?? asString(r.title);
  if (!headline) return null;
  const sev = typeof r.severity === "number" ? Math.round(r.severity) : 3;
  return {
    headline,
    summary: asString(r.summary),
    severity: Math.min(5, Math.max(1, sev)),
    event_time: asString(r.event_time) ?? asString(r.published_at) ?? "",
    chokepoint_name: asString(r.chokepoint_name) ?? asString(r.chokepoint) ?? "unknown",
  };
}

/** Translate the Python service response into the shape the rest of the app already uses. */
function normalize(
  agent: AgentRouteRiskResponse,
  orderId?: string
): RouteRiskResponse {
  const viableModes = agent.modes.filter((m) => m.viable);

  const modes: ModeRisk[] = agent.modes.map((m) => ({
    mode: m.mode,
    viable: m.viable,
    status: asColor(m.status) ?? "unknown",
    score: m.score ?? null,
    summary: m.summary ?? null,
    reason: m.reason ?? null,
  }));

  // Chokepoints (deduped by name) and events (deduped by headline) across viable modes.
  const chokepointMap = new Map<string, ChokepointStatus>();
  const eventMap = new Map<string, DrivingEvent>();
  for (const m of viableModes) {
    for (const c of m.chokepoints ?? []) {
      const cp = toChokepoint(c);
      if (cp && !chokepointMap.has(cp.name)) chokepointMap.set(cp.name, cp);
    }
    for (const e of m.driving_events ?? []) {
      const ev = toEvent(e);
      if (ev && !eventMap.has(ev.headline)) eventMap.set(ev.headline, ev);
    }
  }
  const chokepoints = [...chokepointMap.values()];
  const driving_events = [...eventMap.values()];

  // Overall status = worst known colour; "unknown" if nothing has a real status.
  const colours: Color[] = [
    ...viableModes.map((m) => asColor(m.status)),
    ...chokepoints.map((c) => c.status),
  ].filter((c): c is Color => c !== null);

  const overall_status: Status = colours.length
    ? colours.reduce((worst, c) => (SEVERITY_RANK[c] > SEVERITY_RANK[worst] ? c : worst))
    : "unknown";

  const known_route = chokepoints.length > 0;

  const summaries = viableModes
    .map((m) => (m.summary ? m.summary.trim() : null))
    .filter((s): s is string => !!s);
  const recommendation =
    summaries.join(" ") ||
    "No risk data is available for this lane. This does not mean the route is risk-free.";

  return {
    supplier_region: agent.origin,
    destination_region: agent.destination,
    known_route,
    overall_status,
    chokepoints,
    driving_events,
    recommendation,
    order_id: orderId,
    message: known_route
      ? undefined
      : "No tracked chokepoints were identified on this lane, so risk data isn't available.",
    modes,
    disclaimer: agent.disclaimer,
  };
}

/* ------------------------------ client ------------------------------ */

/**
 * Calls the Supply Chain Risk Agent's POST /route-risk endpoint.
 *
 * Intentionally forgiving: risk data is advisory, so a timeout, 4xx/5xx or
 * unexpected payload throws RiskAgentUnavailableError and the caller decides
 * what that means for the UI. It should never fail a procurement run.
 */
export async function checkRouteRisk(
  params: CheckRouteRiskParams
): Promise<RouteRiskResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RISK_AGENT_TIMEOUT_MS);

  try {
    const res = await fetch(`${RISK_AGENT_URL}/route-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin_country: params.originCountry,
        destination_country: params.destinationCountry,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new RiskAgentUnavailableError(`HTTP ${res.status} ${detail}`.trim());
    }

    const rawParsed = AgentRouteRiskResponseSchema.safeParse(await res.json());
    if (!rawParsed.success) throw new RiskAgentUnavailableError(rawParsed.error);

    const appParsed = RouteRiskResponseSchema.safeParse(
      normalize(rawParsed.data, params.orderId)
    );
    if (!appParsed.success) throw new RiskAgentUnavailableError(appParsed.error);

    return appParsed.data;
  } catch (err) {
    if (err instanceof RiskAgentUnavailableError) throw err;
    throw new RiskAgentUnavailableError(err);
  } finally {
    clearTimeout(timeout);
  }
}