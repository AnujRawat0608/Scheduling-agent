import { RouteRiskResponseSchema, type RouteRiskResponse } from "./types.js";

const RISK_AGENT_URL = process.env.RISK_AGENT_URL ?? "http://localhost:8000";
const RISK_AGENT_TIMEOUT_MS = 5000; // advisory data — fail fast, never block the order flow

export class RiskAgentUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Risk agent unavailable or timed out");
    this.name = "RiskAgentUnavailableError";
    this.cause = cause;
  }
}

interface CheckRouteRiskParams {
  supplierRegion: string;
  destinationRegion?: string;
  orderId?: string;
}

/**
 * Calls the Supply Chain Risk Agent's /procurement/route-risk endpoint.
 *
 * Intentionally forgiving: risk data is advisory, so a timeout or 5xx here
 * should never fail a procurement run. Callers (the LangGraph node) decide
 * what "unavailable" means for the UI — typically an "unknown" badge, not
 * a blocked order.
 */
export async function checkRouteRisk(
  params: CheckRouteRiskParams
): Promise<RouteRiskResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RISK_AGENT_TIMEOUT_MS);

  try {
    const res = await fetch(`${RISK_AGENT_URL}/procurement/route-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_region: params.supplierRegion,
        destination_region: params.destinationRegion ?? null,
        order_id: params.orderId ?? null,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new RiskAgentUnavailableError(`HTTP ${res.status}`);
    }

    const json = await res.json();
    const parsed = RouteRiskResponseSchema.safeParse(json);

    if (!parsed.success) {
      throw new RiskAgentUnavailableError(parsed.error);
    }

    return parsed.data;
  } catch (err) {
    if (err instanceof RiskAgentUnavailableError) throw err;
    throw new RiskAgentUnavailableError(err);
  } finally {
    clearTimeout(timeout);
  }
}