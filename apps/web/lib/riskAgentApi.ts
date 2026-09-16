// Client for the Supply Chain Risk Agent (separate Python/FastAPI service
// from apps/api). Kept as its own lib file since it's a different backend
// with its own base URL — same pattern as lib/procurementApi.ts being
// separate from lib/supplyChainApi.ts.

const RISK_AGENT_BASE = process.env.NEXT_PUBLIC_RISK_AGENT_URL ?? "http://localhost:8000";

export interface ChokepointStatus {
  id: string;
  name: string;
  mode: "maritime" | "air" | "land" | "rail";
  region: string | null;
  lon: number;
  lat: number;
  score: number | null;
  status: "green" | "yellow" | "red" | null;
  computed_at: string | null;
}

export async function fetchChokepointStatuses(mode?: string): Promise<ChokepointStatus[]> {
  const url = new URL(`${RISK_AGENT_BASE}/chokepoints`);
  if (mode) url.searchParams.set("mode", mode);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch chokepoint statuses");
  return res.json();
}