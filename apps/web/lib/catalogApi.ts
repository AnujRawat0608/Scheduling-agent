import { procurerAuthHeaders as authHeaders, logoutProcurer } from "./procurerAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface CatalogProduct {
  /** Unique id of this supplier's offer (the same product from two suppliers has two ids). */
  offerId: string;
  item: string;
  supplierName: string;
  supplierId: string | null;
  supplierRegion: string | null;
  /** In the supplier's own currency. */
  unitPrice: number;
  currency: string;
  quantityAvailable: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  taxRate: number | null;
  taxInclusive: boolean;
}

export interface CatalogPage {
  products: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCatalog(opts: { q: string; page: number }): Promise<CatalogPage> {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  params.set("page", String(opts.page));

  const res = await fetch(`${API_BASE}/catalog?${params.toString()}`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });

  // Same behaviour as the procurement API: a stale login sends the buyer back to sign in.
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load the catalog");
  }
  return res.json();
}