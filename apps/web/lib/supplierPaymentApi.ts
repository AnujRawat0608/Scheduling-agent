import { formatMoney } from "./format";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/* ------------------------------ Razorpay types ----------------------------- */

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

/** What your backend returns when asked to start a payment for an order. */
interface PaymentSession {
  /** "demo" = backend has PAYMENT_MODE=demo: no gateway, no money, order is confirmed directly. */
  mode?: "razorpay" | "demo";
  keyId?: string; // public Razorpay key id (safe for the browser)
  razorpayOrderId?: string;
  amount: number; // in the smallest currency unit (paise for INR)
  currency: string;
  merchantName?: string;
  description?: string;
}

/* --------------------------------- helpers --------------------------------- */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Payments only work in the browser."));
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

/* ----------------------------------- API ----------------------------------- */

/**
 * Pays for an order that already exists (status "pending").
 *
 *  1. backend creates a Razorpay order for the order's real total (tax + shipping included)
 *  2. the Razorpay window opens and the buyer pays
 *  3. backend verifies the payment signature and marks the order "confirmed"
 *
 * Resolves only after step 3. Rejects if the buyer closes the window or verification fails.
 * Safe to call from the Billing page too (a "Pay now" button on pending orders).
 */
export async function payForOrder(input: {
  orderId: string | null;
  buyerName?: string;
  buyerEmail?: string;
}): Promise<void> {
  if (!input.orderId) throw new Error("Missing order id.");
  const orderId = input.orderId;

  const session = await api<PaymentSession>(`/payments/orders/${orderId}/session`, { method: "POST" });

  // Demo mode: no gateway involved. Ask the buyer to confirm, then let the backend mark it paid.
  if (session.mode === "demo") {
    const total = formatMoney(session.amount / 100, session.currency);
    const ok = window.confirm(`Demo payment: no real money will be charged.\n\nPay ${total} for this order?`);
    if (!ok) throw new Error("Payment was cancelled.");
    await api(`/payments/orders/${orderId}/verify`, { method: "POST", body: JSON.stringify({ demo: true }) });
    return;
  }

  if (!session.keyId || !session.razorpayOrderId) throw new Error("The payment session was incomplete.");
  await loadRazorpay();

  await new Promise<void>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: session.keyId!,
      amount: session.amount,
      currency: session.currency,
      order_id: session.razorpayOrderId!,
      name: session.merchantName ?? "Procurement",
      description: session.description ?? "Supplier order",
      prefill: { name: input.buyerName, email: input.buyerEmail },
      theme: { color: "#3d6bff" },
      handler: async (response) => {
        try {
          await api(`/payments/orders/${orderId}/verify`, {
            method: "POST",
            body: JSON.stringify(response),
          });
          resolve();
        } catch (err) {
          reject(
            new Error(
              `We couldn't confirm your payment (${(err as Error).message}). If money was deducted, it will be matched to your order shortly. Don't pay again.`
            )
          );
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment was cancelled.")) },
    });
    checkout.open();
  });
}