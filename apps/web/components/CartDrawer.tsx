"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { formatMoney } from "../lib/format";
import { useCart, type CartLine } from "../lib/cart";
import { createSupplierOrder } from "../lib/supplierOrdersApi";
import { fetchCurrentProcurer } from "../lib/procurerAuthApi";
// TODO: change this path to the file that exports `payForOrder` (your Razorpay helper).
import { payForOrder } from "../lib/supplierPaymentApi";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/20 disabled:bg-neutral-50 disabled:text-neutral-500";

type Group = {
  key: string;
  supplierId?: string;
  name: string;
  currency: string;
  lines: CartLine[];
  subtotal: number;
};

type PaidSummary = { name: string; total: number | null; currency: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Each supplier is a separate order, and so a separate payment. */
function groupBySupplier(lines: CartLine[]): Group[] {
  const map = new Map<string, Group>();
  for (const l of lines) {
    const key = l.product.supplierId ?? l.product.supplierName;
    const g =
      map.get(key) ??
      ({
        key,
        supplierId: l.product.supplierId,
        name: l.product.supplierName,
        currency: l.product.currency,
        lines: [],
        subtotal: 0,
      } as Group);
    g.lines.push(l);
    g.subtotal = round2(g.subtotal + l.product.unitPrice * l.quantity);
    map.set(key, g);
  }
  return Array.from(map.values());
}

/** Changes whenever the contents of a supplier's group change. */
const signature = (g: Group) =>
  g.lines
    .map((l) => `${l.product.offerId}:${l.quantity}`)
    .sort()
    .join("|");

/* -------------------------------------------------------------------------- */
/*  Drawer                                                                    */
/* -------------------------------------------------------------------------- */

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, count, setQuantity, remove, clear } = useCart();

  const [step, setStep] = useState<"cart" | "details">("cart");
  const [details, setDetails] = useState({ name: "", email: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<PaidSummary[]>([]);

  /**
   * Orders already created for a supplier but not yet paid (e.g. the buyer closed the Razorpay
   * window). Retrying re-uses the same order instead of creating a duplicate, as long as the
   * supplier's items in the cart haven't changed.
   */
  const pendingOrders = useRef(
    new Map<string, { sig: string; orderId: string; total: number | null; currency: string }>()
  );

  const close = () => {
    if (!busy) onClose();
  };

  // Close with Escape (not while a payment is in progress).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // Pre-fill the delivery details from the buyer's account.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!open || prefilled.current) return;
    prefilled.current = true;
    fetchCurrentProcurer()
      .then((p) => {
        if (!p) return;
        const address = [p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ");
        setDetails((d) => ({
          name: d.name || p.contactName || p.companyName || "",
          email: d.email || p.email || "",
          address: d.address || address,
          notes: d.notes,
        }));
      })
      .catch(() => {
        /* the buyer can type the details in */
      });
  }, [open]);

  // Start fresh each time the drawer is reopened.
  useEffect(() => {
    if (open || busy) return;
    setStep("cart");
    setError(null);
    setPaid([]);
  }, [open, busy]);

  if (!open) return null;

  const groups = groupBySupplier(lines);
  const allPaid = paid.length > 0 && lines.length === 0;

  async function pay() {
    const name = details.name.trim();
    const email = details.email.trim();
    const address = details.address.trim();

    if (!name || !EMAIL_RE.test(email) || !address) {
      setError("Enter your name, a valid email and a delivery address.");
      return;
    }

    const snapshot = groupBySupplier(lines);
    if (snapshot.some((g) => !g.supplierId)) {
      setError("An item in your cart is missing its supplier. Remove it and add it again.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      for (const g of snapshot) {
        const sig = signature(g);
        const existing = pendingOrders.current.get(g.key);

        let entry = existing && existing.sig === sig ? existing : null;
        if (!entry) {
          // The server reads price, currency, tax and shipping itself; we only send what and how many.
          const { order } = await createSupplierOrder({
            supplierId: g.supplierId!,
            items: g.lines.map((l) => ({
              productId: l.product.offerId,
              itemName: l.product.item,
              quantity: l.quantity,
            })),
            deliveryAddress: address,
            requesterName: name,
            requesterEmail: email,
            notes: details.notes.trim() || undefined,
          });
          entry = { sig, orderId: order.id, total: order.total, currency: order.currency };
          pendingOrders.current.set(g.key, entry);
        }

        // Opens Razorpay; resolves only after the server has verified the payment.
        await payForOrder({ orderId: entry.orderId, buyerName: name, buyerEmail: email });

        // Paid: take just this supplier's items out of the cart.
        g.lines.forEach((l) => remove(l.product.offerId));
        pendingOrders.current.delete(g.key);
        const done: PaidSummary = { name: g.name, total: entry.total, currency: entry.currency };
        setPaid((p) => [...p, done]);
      }
    } catch (err) {
      // Anything unpaid stays in the cart so the buyer can try again.
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Cart">
      <button className="absolute inset-0 bg-slate-900/30" onClick={close} aria-label="Close cart" />

      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            {step === "details" && !allPaid ? (
              <button
                onClick={() => !busy && setStep("cart")}
                disabled={busy}
                className="text-neutral-400 hover:text-neutral-700 disabled:opacity-40"
                aria-label="Back to cart"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <ShoppingCart size={18} />
            )}
            {allPaid ? "Payment complete" : step === "details" ? "Checkout" : "Your cart"}
            {!allPaid && step === "cart" && (
              <span className="text-xs font-normal text-neutral-500">
                {count} {count === 1 ? "item" : "items"}
              </span>
            )}
          </h2>
          <button
            onClick={close}
            disabled={busy}
            className="text-neutral-400 hover:text-neutral-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className={`flex-1 space-y-5 overflow-y-auto px-5 py-4 ${busy ? "pointer-events-none opacity-70" : ""}`}>
          {/* Already-paid suppliers (also shown if a later payment failed) */}
          {paid.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 size={16} />
                {allPaid ? "All orders paid and confirmed" : `${paid.length} order${paid.length === 1 ? "" : "s"} paid`}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs">
                {paid.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">{p.name}</span>
                    <span className="tabular-nums">
                      {p.total !== null ? formatMoney(Number(p.total), p.currency) : "Paid"}
                    </span>
                  </li>
                ))}
              </ul>
              {allPaid && (
                <p className="mt-2 text-xs text-emerald-700">
                  Each supplier has been notified and will confirm and ship your order.
                </p>
              )}
            </div>
          )}

          {lines.length === 0 && !allPaid && (
            <p className="py-10 text-center text-sm text-neutral-500">Your cart is empty.</p>
          )}

          {/* ---------------------------- Step 1: cart ---------------------------- */}
          {step === "cart" &&
            groups.map((g) => (
              <section key={g.key} className="rounded-lg border border-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-800">{g.name}</span>
                  <span className="text-xs text-neutral-500">{formatMoney(g.subtotal, g.currency)}</span>
                </div>

                <ul className="divide-y divide-neutral-100">
                  {g.lines.map(({ product: p, quantity }) => (
                    <li key={p.offerId} className="flex gap-3 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">{p.item}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatMoney(p.unitPrice, p.currency)} each
                          {p.moq > 1 ? ` · min ${p.moq}` : ""}
                        </p>

                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex items-center rounded-md border border-neutral-200">
                            <button
                              className="px-2 py-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                              onClick={() => setQuantity(p.offerId, quantity - 1)}
                              disabled={quantity <= Math.max(1, p.moq)}
                              aria-label="Decrease quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="min-w-8 text-center text-xs font-medium">{quantity}</span>
                            <button
                              className="px-2 py-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                              onClick={() => setQuantity(p.offerId, quantity + 1)}
                              disabled={quantity >= p.quantityAvailable}
                              aria-label="Increase quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <button
                            onClick={() => remove(p.offerId)}
                            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-red-600"
                          >
                            <Trash2 size={12} />
                            Remove
                          </button>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-neutral-900">
                        {formatMoney(round2(p.unitPrice * quantity), p.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

          {/* --------------------------- Step 2: details -------------------------- */}
          {step === "details" && lines.length > 0 && (
            <>
              <section className="rounded-lg border border-neutral-200">
                <p className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-800">
                  {groups.length === 1 ? "1 order to pay" : `${groups.length} separate orders to pay`}
                </p>
                <ul className="divide-y divide-neutral-100">
                  {groups.map((g) => (
                    <li key={g.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                      <span className="min-w-0 truncate text-neutral-800">
                        {g.name}
                        <span className="ml-1 text-neutral-400">
                          · {g.lines.reduce((n, l) => n + l.quantity, 0)} items
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-neutral-900">
                        {formatMoney(g.subtotal, g.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-neutral-600">Your name</span>
                  <input
                    value={details.name}
                    onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                    autoComplete="name"
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-neutral-600">Email</span>
                  <input
                    type="email"
                    value={details.email}
                    onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))}
                    autoComplete="email"
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-neutral-600">Delivery address</span>
                  <textarea
                    value={details.address}
                    onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))}
                    rows={3}
                    autoComplete="street-address"
                    className={`${fieldClass} resize-none`}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-neutral-600">Notes for suppliers (optional)</span>
                  <textarea
                    value={details.notes}
                    onChange={(e) => setDetails((d) => ({ ...d, notes: e.target.value }))}
                    rows={2}
                    maxLength={500}
                    className={`${fieldClass} resize-none`}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* -------------------------------- Footer ------------------------------- */}
        {allPaid ? (
          <footer className="border-t border-neutral-200 px-5 py-4">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#EA580C]/90"
            >
              Done
            </button>
          </footer>
        ) : (
          lines.length > 0 && (
            <footer className="space-y-3 border-t border-neutral-200 px-5 py-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {step === "cart" ? (
                <>
                  <p className="text-[11px] text-neutral-500">
                    Prices are in each supplier&apos;s own currency and exclude tax and shipping. Suppliers are
                    ordered and paid separately.
                  </p>
                  <button
                    onClick={() => {
                      setError(null);
                      setStep("details");
                    }}
                    className="w-full rounded-lg bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#EA580C]/90"
                  >
                    Checkout
                  </button>
                  <button onClick={clear} className="w-full text-xs text-neutral-500 hover:text-neutral-800">
                    Clear cart
                  </button>
                </>
              ) : (
                <>
                  <p className="flex items-start gap-1.5 text-[11px] text-neutral-500">
                    <Lock size={12} className="mt-0.5 shrink-0" />
                    <span>
                      The final amount, including tax and shipping, is shown in the secure Razorpay window.
                      {groups.length > 1 && " You'll pay each supplier one after the other."}
                    </span>
                  </p>
                  <button
                    onClick={pay}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Processing…
                      </>
                    ) : groups.length === 1 ? (
                      `Pay ${formatMoney(groups[0].subtotal, groups[0].currency)} + tax & shipping`
                    ) : (
                      `Pay ${groups.length} orders`
                    )}
                  </button>
                </>
              )}
            </footer>
          )
        )}
      </aside>
    </div>
  );
}