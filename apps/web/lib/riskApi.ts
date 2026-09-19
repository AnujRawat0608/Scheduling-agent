export type ChokepointRisk = {
  name: string;
  score: number | null;
  status: "green" | "yellow" | "red" | null;
  computed_at: string | null;
};

export type RouteRiskEvent = {
  headline: string;
  summary: string;
  severity: number;
  event_time: string;
  chokepoint_name: string;
};

export type RouteRiskAssessment = {
  supplier_region: string;
  destination_region?: string | null;
  known_route: boolean;
  overall_status: "green" | "yellow" | "red" | "unknown";
  chokepoints: ChokepointRisk[];
  driving_events?: RouteRiskEvent[];
  recommendation: string;
  message?: string;
};

const RISK_AGENT_URL = process.env.NEXT_PUBLIC_RISK_AGENT_URL ?? "http://localhost:8001";

export async function assessRouteRisk(
  supplierRegion: string,
  destinationRegion?: string
): Promise<RouteRiskAssessment> {
  const res = await fetch(`${RISK_AGENT_URL}/procurement/route-risk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplier_region: supplierRegion,
      destination_region: destinationRegion || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Risk check failed (${res.status})`);
  return res.json();
}