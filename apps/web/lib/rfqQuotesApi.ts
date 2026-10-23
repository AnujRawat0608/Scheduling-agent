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

/** The order created when the buyer accepted a quote. */
export interface TaskRfqOrder {
  id: string;
  /** "pending" (awaiting payment) -> "confirmed" -> "shipped" */
  status: string;
  total: number | null;
  currency: string;
}

export interface TaskRfq {
  id: string;
  referenceNumber: string;
  /** "sent" until the supplier replies, then "quoted", then "accepted". */
  status: string;
  currency: string | null;
  dueDate: string | null;
  lineItems: { productName?: string; quantity?: number; unit?: string | null }[];
  supplier: { id: string; businessName: string };
  quote: RfqQuote | null;
  order: TaskRfqOrder | null;
}

async function handle<T>(res: Response, fallback: string): Promise<T> {
  // Same behaviour as the rest of the buyer app: a stale login goes back to sign in.
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

/** The signed-in buyer's RFQs for one procurement task, with each supplier's quote if any. */
export async function fetchTaskRfqs(taskId: string): Promise<{ rfqs: TaskRfq[] }> {
  const res = await fetch(`${API_BASE}/rfqs/by-task/${taskId}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  return handle(res, "Failed to load supplier quotes");
}

/** Accept the supplier's quote: creates the order. `quoteId` is the quote the buyer is looking at. */
export async function acceptQuote(
  rfqId: string,
  input: { quoteId: string; deliveryAddress: string; notes?: string }
): Promise<{ order: TaskRfqOrder }> {
  const res = await fetch(`${API_BASE}/rfq-orders/${rfqId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  return handle(res, "Could not accept the quote");
}