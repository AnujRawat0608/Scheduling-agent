import { authHeaders } from "./supplierAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
// "http://localhost:3001/api" -> "http://localhost:3001" (where /uploads is served)
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

export interface SupplierOffer {
  id: string;
  item: string;
  description: string | null;
  category: string | null;
  supplierName: string;
  supplierType: string | null;
  unitPrice: number;
  leadTimeDays: number;
  dispatchStatus: string | null;
  shippingCost: number;
  moq: number;
  quantityAvailable: number;
  aiScore: number | null;
  supplierId: string | null;
  createdAt: string;
  specs?: Record<string, string> | null;
  unitOfMeasure: string;
  verificationStatus: "pending" | "verified" | "rejected" | null;
  gstVerified: boolean;
  taxType: string | null;
  taxRate: string | null;
  taxInclusive: boolean;
  imageUrl?: string | null;
  currency: string;
}

/** Turns a stored "/uploads/..." path into a full URL the browser can load. */
export function resolveImageUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_ORIGIN}${url}`;
}

export async function listSupplyChainOffers(): Promise<SupplierOffer[]> {
  const res = await fetch(`${API_BASE}/supply-chain`);
  if (!res.ok) throw new Error("Failed to fetch supply chain offers");
  const data = await res.json();
  return data.offers;
}

export interface CreateOfferInput {
  item: string;
  description?: string;
  category?: string;
  supplierName: string;
  supplierType: string;
  unitPrice: number;
  unitOfMeasure: string;
  leadTimeDays: number;
  dispatchStatus?: string;
  shippingCost: number;
  moq: number;
  quantityAvailable: number;
  aiScore?: number;
  specs?: Record<string, string>;
  taxType?: string;
  taxRate?: number;
  taxInclusive?: boolean;
  supplierId?: string;
  imageUrl?: string;
  currency: string;
}

/** Uploads a product image and returns its stored path (e.g. "/uploads/products/abc.jpg"). */
export async function uploadProductImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);

  // Don't set Content-Type: the browser adds the multipart boundary itself.
  // The bearer token is required by requireSupplierAuth on the server.
  const res = await fetch(`${API_BASE}/uploads/product-image`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to upload image");
  }
  const data = await res.json();
  return data.url as string;
}

export async function createSupplyChainOffer(input: CreateOfferInput) {
  const res = await fetch(`${API_BASE}/supply-chain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeaders() as Record<string, string>) },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to add offer");
  }
  return res.json();
}

export async function deleteSupplyChainOffer(id: string) {
  const res = await fetch(`${API_BASE}/supply-chain/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete offer");
}