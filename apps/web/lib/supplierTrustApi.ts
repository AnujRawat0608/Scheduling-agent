import { useQuery } from "@tanstack/react-query";
import { procurerAuthHeaders } from "./procurerAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Everything a BUYER may see about a supplier. This is the whole contract:
 * if a field is not in this type, the server must not send it.
 * Numbers are null when the supplier has too little history to show them fairly.
 */
export type SupplierTrust = {
  supplierId: string;
  businessName: string;
  region: string | null;
  country: string | null;
  businessType: string | null;
  yearEstablished: number | null;
  totalEmployees: string | null;
  mainProducts: string | null;
  memberSince: string; // ISO date

  compliance: {
    /** METIS reviewed this business (KYC), set by an admin. */
    businessVerified: boolean;
    gstProvided: boolean;
    gstVerified: boolean;
    documents: {
      id: "iso9001" | "tradeLicense" | "insurance";
      label: string;
      provided: boolean;
      /** METIS reviewed this document. */
      verified: boolean;
      expired: boolean;
    }[];
  };

  performance: {
    /** Orders confirmed, shipped or delivered, rounded down to a band (5, 10, 15...). null = not enough history. */
    ordersHandled: number | null;
    /** 0 to 1. Always null until orders store promised and delivered dates. */
    onTimeRate: number | null;
    /** Share of RFQs that got a quote, 0 to 1. null until enough RFQs. */
    quoteResponseRate: number | null;
    catalogSize: number;
  };
};

export async function fetchSupplierTrust(supplierId: string): Promise<SupplierTrust> {
  const res = await fetch(`${API_BASE}/procurers/suppliers/${encodeURIComponent(supplierId)}/trust`, {
    headers: { "Content-Type": "application/json", ...procurerAuthHeaders() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't load supplier details");
  }
  return res.json();
}

/** Cached per supplier, so the table cell and the scorecard page share one request. */
export function useSupplierTrust(supplierId?: string | null) {
  return useQuery({
    queryKey: ["supplier-trust", supplierId],
    queryFn: () => fetchSupplierTrust(supplierId as string),
    enabled: !!supplierId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}