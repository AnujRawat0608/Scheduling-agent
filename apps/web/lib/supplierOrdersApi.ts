const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface SupplierOrderInput {
  supplierId: string;
  productId?: string;
  itemName: string;
  unitPrice?: number;
  quantity: number;
  deliveryAddress: string;
  requesterName: string;
  requesterEmail: string;
  notes?: string;
}

export interface SupplierOrder extends SupplierOrderInput {
  id: string;
  status: string;
  createdAt: string;
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function createSupplierOrder(input: SupplierOrderInput) {
  const res = await fetch(`${API_BASE}/supplier-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to place order");
}

export async function fetchAllSupplierOrders() {
  const res = await fetch(`${API_BASE}/supplier-orders`);
  return parseErrorOr<{ orders: SupplierOrder[] }>(res, "Failed to load orders");
}

export async function confirmSupplierOrder(orderId: string) {
  const res = await fetch(`${API_BASE}/supplier-orders/${orderId}/confirm`, {
    method: "PATCH",
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to confirm order");
}