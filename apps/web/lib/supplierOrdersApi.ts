import { authHeaders } from "./supplierAuthApi";
import { procurerAuthHeaders, logoutProcurer } from "./procurerAuthApi";

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
  /** Ignored by the server: the buyer's email always comes from their login. */
  requesterEmail?: string;
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

/**
 * fetch() for buyer-only endpoints: attaches the buyer's login token and, if the server says
 * the buyer isn't signed in (401), clears the stale token and sends them to the login page.
 */
async function buyerFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...procurerAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    await logoutProcurer();
    window.location.href = "/procurement/login";
    throw new Error("Please sign in to continue.");
  }
  return res;
}

/**
 * Signed-in buyer places an order. Only productId and quantity matter: the server reads price,
 * currency, tax and shipping itself, and takes the buyer's email from their login.
 */
export async function createSupplierOrder(input: SupplierOrderInput) {
  const res = await buyerFetch("/supplier-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to place order");
}

/** Billing page: the signed-in buyer's own orders. */
export async function fetchAllSupplierOrders() {
  const res = await buyerFetch("/supplier-orders");
  return parseErrorOr<{ orders: SupplierOrder[] }>(res, "Failed to load orders");
}

/** Supplier dashboard: only the orders addressed to the logged-in supplier. */
export async function fetchMySupplierOrders() {
  const res = await fetch(`${API_BASE}/supplier-orders/mine`, {
    headers: authHeaders(),
  });
  return parseErrorOr<{ orders: SupplierOrder[] }>(res, "Failed to load your orders");
}

// There is no "confirm" call any more. An order becomes confirmed only after the buyer's payment
// is verified on the server (see supplierPaymentApi.ts).

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

/**
 * Supplier declines an unpaid ("pending") order. The server cancels it and returns
 * the reserved stock to the catalog. Fails if the order is already paid or cancelled.
 */
export async function declineSupplierOrder(orderId: string) {
  const res = await fetch(`${API_BASE}/supplier-orders/${orderId}/decline`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to decline the order");
}

/**
 * Signed-in buyer cancels their own unpaid ("pending") order. The server cancels it
 * and returns the reserved stock. Fails if the order is already paid or cancelled.
 */
export async function cancelSupplierOrder(orderId: string) {
  const res = await buyerFetch(`/supplier-orders/${orderId}/cancel`, {
    method: "PATCH",
  });
  return parseErrorOr<{ order: SupplierOrder }>(res, "Failed to cancel the order");
}
/** Buyer accepts the supplier's quote. The server creates the pending order; the buyer pays on Billing. */
export async function acceptQuoteForRfq(args: {
  rfqId: string;
  quoteId: string;
  deliveryAddress: string;
  notes?: string;
}) {
  const res = await buyerFetch(`/rfq-orders/${args.rfqId}/accept`, {
    method: "POST",
    body: JSON.stringify({
      quoteId: args.quoteId,
      deliveryAddress: args.deliveryAddress,
      notes: args.notes,
    }),
  });
  return parseErrorOr<{ order: { id: string; status: string; total: number; currency: string } }>(
    res,
    "Couldn't accept the quote"
  );
}

/** Buyer reopens a received quote ("bargain reset"). The supplier can then send exactly one new quote. */
export async function requestQuoteRevision(args: { rfqId: string; note: string }) {
  const res = await buyerFetch(`/rfq-orders/${args.rfqId}/request-revision`, {
    method: "POST",
    body: JSON.stringify({ note: args.note }),
  });
  return parseErrorOr<{ notified: boolean }>(res, "Couldn't request a revision");
}