import { authHeaders } from "./supplierAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface SupplierOrderItemInput {
  productId?: string;
  itemName: string;
  unitPrice?: number;
  quantity: number;
}

export interface SupplierOrderInput {
  supplierId: string;
  items: SupplierOrderItemInput[];
  deliveryAddress: string;
  requesterName: string;
  requesterEmail: string;
  notes?: string;
}

export interface SupplierOrderItem extends SupplierOrderItemInput {
  id: string;
  subtotal: number | null;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  items: SupplierOrderItem[];
  deliveryAddress: string;
  requesterName: string;
  requesterEmail: string;
  notes?: string;
  status: string;
  createdAt: string;
  taxType: string | null;
  taxRate: string | null;
  taxInclusive: boolean;
  subtotal: number | null;
  taxAmount: number | null;
  shippingCost: number | null;
  total: number | null;
  currency: string;
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

/** Buyer places an order. Only productId and quantity matter: the server reads price, currency, tax and shipping itself. */
export async function createSupplierOrder(input: SupplierOrderInput) {
  const res = await fetch(`${API_BASE}/supplier-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to place order");
}

/** Billing page (buyer view): all orders. Public for now, to be locked down with buyer accounts. */
export async function fetchAllSupplierOrders() {
  const res = await fetch(`${API_BASE}/supplier-orders`);
  return parseErrorOr<{ orders: SupplierOrder[] }>(res, "Failed to load orders");
}

/** Supplier dashboard: only the orders addressed to the logged-in supplier. */
export async function fetchMySupplierOrders() {
  const res = await fetch(`${API_BASE}/supplier-orders/mine`, {
    headers: authHeaders(),
  });
  return parseErrorOr<{ orders: SupplierOrder[] }>(res, "Failed to load your orders");
}

/** Supplier accepts an order. The server only allows this for orders addressed to the logged-in supplier. */
export async function confirmSupplierOrder(orderId: string) {
  const res = await fetch(`${API_BASE}/supplier-orders/${orderId}/confirm`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to confirm order");
}

/**
 * Supplier starts shipping a confirmed order. The server marks it shipped and emails the
 * buyer; `notified` says whether that email went out.
 */
export async function startShipping(orderId: string) {
  const res = await fetch(`${API_BASE}/supplier-orders/${orderId}/ship`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  return parseErrorOr<{ order: SupplierOrder; notified: boolean }>(res, "Failed to start shipping");
}