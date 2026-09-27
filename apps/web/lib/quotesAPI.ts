export type Supplier = {
  id: string;
  name: string;
};

export type QuoteLineItem = {
  id: string;
  productName: string;
  quantity: number;
  /** Rupees, not paise — converted at the API boundary. */
  rate: number;
};

export type QuoteDraft = {
  supplierId: string;
  supplierName: string;
  dueDate: string;
  referenceNumber: string;
  lineItems: QuoteLineItem[];
  discountPercent: number;
  taxPercent: number;
  /** Rupees, not paise. */
  shippingCost: number;
  notes: string;
};

export type QuoteStatus = "draft" | "sent";

export type Quote = QuoteDraft & {
  id: string;
  status: QuoteStatus;
  createdAt: string;
};

/* ---------- Suppliers ---------- */

export async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers");
  if (!res.ok) throw new Error("Couldn't load suppliers.");
  const data = await res.json();
  return data.suppliers;
}

/* ---------- Quotes ---------- */

export async function saveQuote(payload: QuoteDraft & { status: QuoteStatus }): Promise<Quote> {
  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "Couldn't save the quote.");
  }
  return res.json();
}