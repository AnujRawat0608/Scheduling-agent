const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface SupplierOffer {
  id: string;
  item: string;
  supplierName: string;
  unitPrice: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  quantityAvailable: number;
  createdAt: string;
}

export async function listSupplyChainOffers(): Promise<SupplierOffer[]> {
  const res = await fetch(`${API_BASE}/supply-chain`);
  if (!res.ok) throw new Error("Failed to fetch supply chain offers");
  const data = await res.json();
  return data.offers;
}

export interface CreateOfferInput {
  item: string;
  supplierName: string;
  unitPrice: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  quantityAvailable: number;
}

export async function createSupplyChainOffer(input: CreateOfferInput) {
  const res = await fetch(`${API_BASE}/supply-chain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to add offer");
  }
  return res.json();
}

export async function deleteSupplyChainOffer(id: string) {
  const res = await fetch(`${API_BASE}/supply-chain/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete offer");
}