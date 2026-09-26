/**
 * Client for the risk agent's generic route risk endpoint.
 *
 * Calls POST /route-risk on the FastAPI backend with an origin and
 * destination country, and returns a risk breakdown across every viable
 * freight mode (sea/air/road/rail). This client — and the endpoint behind
 * it — knows nothing about suppliers, orders, or pricing; it's a thin
 * wrapper around a generic origin->destination lookup.
 */

const RISK_API_BASE_URL = process.env.NEXT_PUBLIC_RISK_API_URL ?? "http://localhost:8000";

export type RiskStatus = "green" | "yellow" | "red" | "unknown";
export type FreightMode = "sea" | "air" | "road" | "rail";

export type Chokepoint = {
  name: string;
  region: string | null;
  score: number | null;
  status: RiskStatus;
  computed_at: string | null;
};

export type DrivingEvent = {
  headline: string;
  summary: string | null;
  severity: number;
  confidence: number;
  event_time: string;
  chokepoint_name: string;
};

// Flat shape (rather than a discriminated union on `viable`) deliberately:
// it avoids relying on TS control-flow narrowing behaving a particular way
// across every tsconfig/editor setup. All fields besides mode/viable are
// optional and only present when viable is true — check for their presence
// with `?? fallback` rather than assuming the union narrowed.
export type ModeAssessment = {
  mode: FreightMode;
  viable: boolean;
  reason?: string;
  chokepoints?: Chokepoint[];
  status?: RiskStatus;
  score?: number | null;
  driving_events?: DrivingEvent[];
  summary?: string;
};

export type RouteRiskResponse = {
  origin: string;
  destination: string;
  modes: ModeAssessment[];
  disclaimer: string;
};

export async function assessRouteRisk(
  originCountry: string,
  destinationCountry: string
): Promise<RouteRiskResponse> {
  const res = await fetch(`${RISK_API_BASE_URL}/route-risk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin_country: originCountry,
      destination_country: destinationCountry,
    }),
  });

  if (!res.ok) {
    throw new Error(`Route risk request failed: ${res.status}`);
  }

  return res.json();
}