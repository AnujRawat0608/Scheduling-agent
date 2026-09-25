const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface LineItem {
  item: string;
  quantity: number;
  specifications?: string;
}

export interface SupplierQuote {
  supplierName: string;
  supplierId: string | null;
  supplierRegion: string | null;
  unitPrice: number;
  quantityAvailable: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  respondedAt: string;
}

export interface QuoteScore extends SupplierQuote {
  totalCost: number;
  score: number;
  rationale: string;
}

export interface LineItemQuotes {
  lineItem: LineItem;
  quotes: SupplierQuote[];
  scoredQuotes: QuoteScore[];
  topQuotes: QuoteScore[];
  hasMatch: boolean;
}

export interface FulfillmentLeg {
  supplierName: string;
  supplierId: string | null;
  lineItems: LineItem[];
  quotes: QuoteScore[];
  legCost: number;
}

export interface FulfillmentPlan {
  type: "single_supplier" | "split" | "partial";
  legs: FulfillmentLeg[];
  unmatchedItems: LineItem[];
  totalCost: number;
  rationale: string;
}

export interface PurchaseConfirmation {
  supplierName: string;
  supplierId: string | null;
  lineItems: LineItem[];
  confirmedCost: number;
  confirmedAt: string;
}

export interface ProcurementRequest {
  requesterName: string;
  requesterEmail: string;
  lineItems: LineItem[];
  requiredBy?: string;
}

export interface ProcurementTaskSummary {
  id: string;
  itemsSummary: string;
  lineItemCount: number;
  status: string;
  requesterEmail: string;
  createdAt: string;
}

export interface RiskAssessment {
  supplier_region: string;
  destination_region?: string | null;
  known_route: boolean;
  overall_status: "green" | "yellow" | "red" | "unknown";
  chokepoints: Array<{ name: string; status: string | null; score: number | null }>;
  driving_events: Array<{ headline: string; summary: string | null; severity: number; chokepoint_name: string }>;
  recommendation: string;
}

export interface ProcurementSnapshot {
  task: {
    id: string;
    itemsSummary: string;
    lineItemCount: number;
    status: string;
    createdAt: string;
  };
  state: {
    request: ProcurementRequest;
    rfqEmails: Record<string, string>;
    lineItemQuotes: LineItemQuotes[];
    recommendedPlan: FulfillmentPlan | null;
    alternativePlans: FulfillmentPlan[];
    purchaseConfirmations: PurchaseConfirmation[];
    status: string;
    failureReason: string | null;
    riskCheckStatus?: "skipped" | "ok" | "unavailable";
    riskAssessment?: Record<string, RiskAssessment> | null;
  };
  next: string[];
}

export async function listProcurementTasks(): Promise<ProcurementTaskSummary[]> {
  const res = await fetch(`${API_BASE}/procurement`);
  if (!res.ok) throw new Error("Failed to fetch procurement tasks");
  const data = await res.json();
  return data.tasks;
}

export async function createProcurementTask(input: {
  text: string;
  requesterEmail: string;
  requesterName?: string;
  useRiskAnalysis?: boolean;
}): Promise<{ taskId: string }> {
  const res = await fetch(`${API_BASE}/procurement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to create procurement task");
  }
  return res.json();
}

export async function fetchProcurementTask(id: string): Promise<ProcurementSnapshot> {
  const res = await fetch(`${API_BASE}/procurement/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${id}`);
  return res.json();
}

// selectedPlanIndex: omitted/0 = accept recommendedPlan, 1+ = pick that index from alternativePlans.
// Kept here even though the main request page doesn't use it, since other
// pages (or a future approval view) may still need to approve a task.
export async function approveProcurementTask(id: string, selectedPlanIndex?: number) {
  const res = await fetch(`${API_BASE}/procurement/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: true, selectedPlanIndex }),
  });
  if (!res.ok) throw new Error(`Failed to approve task ${id}`);
  return res.json();
}

export async function rejectProcurementTask(id: string, note: string) {
  const res = await fetch(`${API_BASE}/procurement/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: false, note }),
  });
  if (!res.ok) throw new Error(`Failed to reject task ${id}`);
  return res.json();
}