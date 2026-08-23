const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface SupplierQuote {
  supplierName: string;
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

export interface ProcurementRequest {
  requesterName: string;
  requesterEmail: string;
  item: string;
  quantity: number;
  requiredBy?: string;
  specifications?: string;
}

export interface ProcurementTaskSummary {
  id: string;
  item: string;
  quantity: number;
  status: string;
  requesterEmail: string;
  createdAt: string;
}

export interface ProcurementSnapshot {
  task: {
    id: string;
    item: string;
    quantity: number;
    status: string;
    createdAt: string;
  };
  state: {
    request: ProcurementRequest;
    rfqEmail: string | null;
    quotes: SupplierQuote[];
    scoredQuotes: QuoteScore[];
    recommendedSupplier: QuoteScore | null;
    status: string;
    failureReason: string | null;
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

export async function approveProcurementTask(id: string, selectedSupplier?: string) {
  const res = await fetch(`${API_BASE}/procurement/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved: true, selectedSupplier }),
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