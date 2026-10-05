import { procurerAuthHeaders as authHeaders, logoutProcurer } from "./procurerAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * fetch() for buyer-only endpoints: attaches the buyer's login token and, if the server says
 * the buyer isn't signed in (401), clears the stale token and sends them to the login page.
 */
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  return res;
}

export interface LineItem {
  item: string;
  quantity: number;
  specifications?: string;
}
export interface PricingBreakdown {
  supplierCurrency: string;
  buyerCurrency: string;
  fxRate: number; // 1 supplier-currency unit = fxRate buyer-currency units
  taxRate: number | null;
  taxInclusive: boolean;
  unitPriceConverted: number;
  local: { subtotal: number; taxAmount: number; shipping: number; total: number };
  converted: { subtotal: number; taxAmount: number; shipping: number; total: number };
}

export interface SupplierQuote {
  supplierName: string;
  supplierId: string | null;
  supplierRegion: string | null;
  /** The product title the supplier actually listed, so the buyer can verify the match. */
  offerItem?: string;
  unitPrice: number;
  quantityAvailable: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  respondedAt: string;
  currency: string;
  taxType: string | null;
  taxRate: number | null;
  taxInclusive: boolean;
  simulated?: boolean;
}

export interface QuoteScore extends SupplierQuote {
  totalCost: number | null;
  buyerCurrency: string;
  pricing: PricingBreakdown | null;
  score: number;
  isBest: boolean;
  rationale: string;
  meetsDeadline?: boolean;
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

/** Result of sending an RFQ to one supplier after the plan was approved. */
export interface RfqResult {
  supplierName: string;
  supplierId: string;
  status: "sent" | "failed";
  rfqId?: string;
  referenceNumber?: string;
  /** false = the RFQ was saved (supplier sees it in their dashboard) but the email did not go out. */
  emailed?: boolean;
  error?: string;
}

export type Priority = "balanced" | "cheapest" | "fastest";

export interface ProcurementRequest {
  requesterName: string;
  requesterEmail: string;
  /** The buyer who owns this request (set by the server from the login token). */
  procurerId?: string;
  lineItems: LineItem[];
  requiredBy?: string;
  priority?: Priority;
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
    rfqResults?: RfqResult[];
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
  const res = await authedFetch("/procurement");
  if (!res.ok) throw new Error("Failed to fetch procurement tasks");
  const data = await res.json();
  return data.tasks;
}

// The requester's name and email are NOT sent: the server reads them from the buyer's login token.
export async function createProcurementTask(input: {
  text: string;
  useRiskAnalysis?: boolean;
  priority?: Priority;
}): Promise<{ taskId: string }> {
  const res = await authedFetch("/procurement", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to create procurement task");
  }
  return res.json();
}

export async function fetchProcurementTask(id: string): Promise<ProcurementSnapshot> {
  const res = await authedFetch(`/procurement/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${id}`);
  return res.json();
}

// selectedPlanIndex: omitted/0 = accept recommendedPlan, 1+ = pick that index from alternativePlans.
export async function approveProcurementTask(id: string, selectedPlanIndex?: number) {
  const res = await authedFetch(`/procurement/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: true, selectedPlanIndex }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to approve task ${id}`);
  }
  return res.json();
}

export async function rejectProcurementTask(id: string, note: string) {
  const res = await authedFetch(`/procurement/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved: false, note }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to reject task ${id}`);
  }
  return res.json();
}