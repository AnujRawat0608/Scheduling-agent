const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface RfqLineItem {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
}

export interface RfqLineItemQuote extends RfqLineItem {
  unitPrice: number;
  lineTotal: number;
}

export interface RfqQuote {
  id: string;
  rfqId: string;
  supplierId: string;
  currency: string | null;
  totalPrice: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lineItemQuotes: RfqLineItemQuote[];
  createdAt: string;
}

export interface RfqSupplier {
  id: string;
  businessName: string;
  contactName: string | null;
}

export interface Rfq {
  id: string;
  supplierId: string;
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  status: "draft" | "sent" | "quoted";
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
  createdAt: string;
  updatedAt?: string;
  supplier: RfqSupplier | null;
  quotes: RfqQuote[];
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function fetchRfq(id: string) {
  const res = await fetch(`${API_BASE}/rfqs/${id}`);
  return parseErrorOr<{ rfq: Rfq }>(res, "Failed to load RFQ");
}