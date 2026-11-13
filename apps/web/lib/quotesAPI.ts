import { procurerAuthHeaders } from "./procurerAuthApi";

export type VerificationStatus = "pending" | "verified" | "rejected";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export type Supplier = {
  id: string;
  businessName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  pincode: string | null;
  gstNumber: string | null;
  gstVerified: boolean;
  verificationStatus: VerificationStatus;
  businessType: string | null;
  yearEstablished: number | null;
  mainProducts: string | null;
  /** Free-text field from the supplier's profile — not a checklist, just what they've self-reported. */
  certifications: string | null;
  averageLeadTimeDays: number | null;
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

/** "directory" = picked from the supplier list; "external" = invited by email, no account yet. */
export type SupplierType = "directory" | "external";

export type QuoteDraft = {
  /* Supplier */
  supplierType: SupplierType;
  /** Empty string for external suppliers (they have no account/ID yet). */
  supplierId: string;
  /** Business name — from the directory, or the company name typed for an external supplier. */
  supplierName: string;
  /** Where the RFQ link is emailed. For directory suppliers this is their profile email. */
  supplierEmail: string;
  supplierContactName: string;
  /** Only collected for external suppliers. */
  supplierCountry: string;

  dueDate: string;
  referenceNumber: string;
  /** Who this RFQ is from — required so the supplier knows who to respond to. */
  requesterName: string;
  requesterEmail: string;
  /** ISO 4217 currency code the supplier should quote in, e.g. "INR", "USD", "CNY". */
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
  /** Incoterms 2020 code, e.g. "EXW", "FOB", "DDP". */
  incoterm: string;
  /** Named port/city the Incoterm applies to, e.g. "Shenzhen" → "FOB Shenzhen". */
  incotermPlace: string;
  packagingRequirements: string;

  /* Quality, warranty & compliance */
  warrantyPeriod: string;
  qualityRequirements: string;
  requiredCertifications: string;
  insuranceRequired: boolean;
  /**
   * Filenames of attached CAD models / drawings (.step, .stp, .stl, .iges,
   * .igs, .dwg, .pdf).
   * NOTE: these are filenames only, not the files themselves — see the
   * comment in page.tsx for what's needed to actually persist uploads.
   */
  technicalDocumentNames: string[];

  notes: string;
};

export type QuoteStatus = "draft" | "sent" | "quoted" | "revision_requested" | "accepted";

/** A supplier's priced response to one line item of a Quote (RFQ). */
export type ResponseLineItem = {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/**
 * The supplier's response to a Quote — named distinctly from `Quote` itself
 * (which is the outgoing RFQ) to avoid the two colliding in code, even
 * though the person-facing language for both is "quote."
 */
export type SupplierResponse = {
  id: string;
  rfqId: string;
  /** Null until an external supplier has been onboarded via their RFQ link. */
  supplierId: string | null;
  currency: string | null;
  totalPrice: number | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lineItemQuotes: ResponseLineItem[];
  createdAt: string;
};

export type Quote = QuoteDraft & {
  id: string;
  status: QuoteStatus;
  createdAt: string;
  revisionCount?: number;
  revisionNote?: string | null;
};

/** The detail shape returned by GET /api/rfqs/:id — the Quote itself, plus
 * the supplier's basic info and any response(s) received so far.
 * `supplier` is null for an external supplier who hasn't onboarded yet. */
export type QuoteDetail = Quote & {
  supplier: { id: string; businessName: string; contactName: string | null } | null;
  responses: SupplierResponse[];
};

/* ---------- Helpers ---------- */

/** Reads the server's error message from a failed response, falling back to a default. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.message ?? body?.error ?? fallback;
}

/* ---------- Suppliers ---------- */

export async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch(`${API_BASE}/suppliers`, {
    headers: procurerAuthHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load suppliers."));
  const data = await res.json();
  return data.suppliers;
}

/* ---------- Quotes ---------- */

export async function saveQuote(payload: QuoteDraft & { status: QuoteStatus }): Promise<Quote> {
  const res = await fetch(`${API_BASE}/rfqs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...procurerAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't save the quote."));
  const data = await res.json();
  return data.rfq;
}

/**
 * All Quotes (RFQs) sent so far, for the list page at /quotes.
 * NOTE: the backend endpoint for this doesn't exist yet — see the
 * GET /api/rfqs route that needs to be added alongside GET /api/rfqs/:id.
 */
export async function fetchAllQuotes(): Promise<Quote[]> {
  const res = await fetch(`${API_BASE}/rfqs`, {
    headers: procurerAuthHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load quotes."));
  const data = await res.json();
  return data.rfqs;
}

export async function fetchQuote(id: string): Promise<QuoteDetail> {
  const res = await fetch(`${API_BASE}/rfqs/${id}`, {
    headers: procurerAuthHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load this quote."));
  const data = await res.json();
  return {
    ...data.rfq,
    // Directory suppliers are joined in as `supplier`; external suppliers have
    // no account yet, so fall back to the company name stored on the rfq row.
    supplierName: data.rfq.supplier?.businessName ?? data.rfq.supplierName ?? "the supplier",
    responses: data.rfq.quotes,
  };
}