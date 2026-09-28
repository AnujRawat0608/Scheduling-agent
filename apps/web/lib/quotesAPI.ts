export type Supplier = {
  id: string;
  name: string;
};

export type QuoteLineItem = {
  id: string;
  productName: string;
  /** Tolerance, grade, or standard reference for this item. */
  specification?: string;
  /** Unit of measure — one of "Pcs" | "Box" | "Kg" | "Litre" | "Lot". */
  unit?: string;
  quantity: number;
};

export type QuoteDraft = {
  supplierId: string;
  supplierName: string;
  dueDate: string;
  referenceNumber: string;
  /** ISO 4217 currency code the supplier should quote in, e.g. "INR", "USD". */
  currency: string;
  /** ISO date string — quote requested to remain valid up to and including this date. */
  priceValidUntil: string;
  lineItems: QuoteLineItem[];

  /* Technical specification & scope */
  scopeNotes: string;
  assumptionsExclusions: string;

  /* Payment terms */
  paymentTerms: string;

  /* Delivery & logistics */
  deliveryAddress: string;
  /** ISO date string — hard target date goods must arrive. */
  requiredDeliveryDate: string;
  incoterm: string;
  packagingRequirements: string;

  /* Quality, warranty & compliance */
  warrantyPeriod: string;
  qualityRequirements: string;
  requiredCertifications: string;
  insuranceRequired: boolean;
  /**
   * Filenames of attached technical documents (CAD, drawings, spec sheets).
   * NOTE: these are filenames only, not the files themselves — see the
   * comment in page.tsx for what's needed to actually persist uploads.
   */
  technicalDocumentNames: string[];

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