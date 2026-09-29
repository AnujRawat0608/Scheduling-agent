import { authHeaders } from "./supplierAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export type RfqLineItem = {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
};

export type RfqStatus = "draft" | "sent";

export type Rfq = {
  id: string;
  supplierId: string;
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  status: RfqStatus;
  currency: string | null;
  dueDate: string | null;
  priceValidUntil: string | null;
  lineItems: RfqLineItem[];
  scopeNotes: string | null;
  assumptionsExclusions: string | null;
  paymentTerms: string | null;
  deliveryAddress: string | null;
  requiredDeliveryDate: string | null;
  incoterm: string | null;
  packagingRequirements: string | null;
  warrantyPeriod: string | null;
  qualityRequirements: string | null;
  requiredCertifications: string | null;
  insuranceRequired: boolean;
  technicalDocumentNames: string[];
  notes: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
};

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function fetchMyRfqs(): Promise<Rfq[]> {
  const res = await fetch(`${API_BASE}/rfqs/me`, { headers: authHeaders() });
  const data = await parseErrorOr<{ rfqs: Rfq[] }>(res, "Couldn't load RFQs.");
  return data.rfqs;
}

export async function fetchUnreadRfqCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/rfqs/me/unread-count`, { headers: authHeaders() });
  const data = await parseErrorOr<{ count: number }>(res, "Couldn't load unread count.");
  return data.count;
}

export async function fetchRfqDetail(id: string): Promise<Rfq> {
  const res = await fetch(`${API_BASE}/rfqs/me/${id}`, { headers: authHeaders() });
  const data = await parseErrorOr<{ rfq: Rfq }>(res, "Couldn't load this RFQ.");
  return data.rfq;
}