import { procurerAuthHeaders, logoutProcurer } from "./procurerAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface DutyComponent {
  name: string;
  layer: "standard" | "additional";
  mode: "add" | "top_up_to";
  ratePercent: number;
  appliedRatePercent: number;
  dutiableValue: number;
  amount: number;
  verified: boolean;
  source: string | null;
  sourceUrl: string | null;
}

export interface RestrictionNote {
  status: "permit_required" | "prohibited";
  note: string;
  verified: boolean;
  sourceUrl: string | null;
}

export type DutyEstimate =
  | { status: "domestic" }
  | { status: "prohibited"; restrictions: RestrictionNote[] }
  | { status: "not_estimated"; reason: string; restrictions: RestrictionNote[] }
  | {
      status: "estimated";
      dutyAmount: number;
      effectiveRatePercent: number;
      components: DutyComponent[];
      allVerified: boolean;
      restrictions: RestrictionNote[];
      assumptions: string[];
    };

export interface DutyRequest {
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  goodsValue: number;
  shipping?: number;
  insurance?: number;
}

export async function estimateTariff(input: DutyRequest): Promise<DutyEstimate> {
  const res = await fetch(`${API_BASE}/tariff/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...procurerAuthHeaders() },
    body: JSON.stringify(input),
  });
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not estimate duty");
  }
  return res.json();
}