import { procurerAuthHeaders as authHeaders, logoutProcurer } from "./procurerAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface RfqQuoteLine {
  productName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  lineTotal?: number;
  notes?: string;
}

export interface RfqQuote {
  id: string;
  currency: string | null;
  totalPrice: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lineItemQuotes: RfqQuoteLine[];
  createdAt: string;
}

export interface TaskRfq {
  id: string;
  referenceNumber: string;
  /** "sent" until the supplier replies, then "quoted". */
  status: string;
  currency: string | null;
  dueDate: string | null;
  lineItems: { productName?: string; quantity?: number; unit?: string | null }[];
  supplier: { id: string; businessName: string };
  quote: RfqQuote | null;
}

/** The signed-in buyer's RFQs for one procurement task, with each supplier's quote if any. */
export async function fetchTaskRfqs(taskId: string): Promise<{ rfqs: TaskRfq[] }> {
  const res = await fetch(`${API_BASE}/rfqs/by-task/${taskId}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });

  // Same behaviour as the rest of the buyer app: a stale login goes back to sign in.
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load supplier quotes");
  }
  return res.json();
}