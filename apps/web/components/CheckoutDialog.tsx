"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, ShieldCheck, Smartphone, X } from "lucide-react";
import { formatMoney } from "../lib/format";

export type PaymentMethod = "upi" | "card" | "netbanking";

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "upi", label: "UPI", hint: "Pay with any UPI app", icon: <Smartphone size={18} /> },
  { id: "card", label: "Credit or debit card", hint: "Visa, Mastercard, RuPay", icon: <CreditCard size={18} /> },
  { id: "netbanking", label: "Net banking", hint: "Pay from your bank account", icon: <Landmark size={18} /> },
];

export interface CheckoutLine {
  key: string;
  itemName: string;
  quantity: number;
  unitPrice: number | null;
  currency: string;
}

interface CheckoutDialogProps {
  open: boolean;
  supplierName: string;
  lines: CheckoutLine[];
  currency: string;
  subtotal: number;
  buyer: { name: string; email: string; address: string; notes: string };
  isPending: boolean;
  error: string | null;
  done: boolean;
  onConfirm: (method: PaymentMethod) => void;
  onClose: () => void;
  onViewOrder: () => void;
}

export function CheckoutDialog({
  open,
  supplierName,
  lines,
  currency,
  subtotal,
  buyer,
  isPending,
  error,
  done,
  onConfirm,
  onClose,
  onViewOrder,
}: CheckoutDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the dialog when it opens, and let Escape close it (never mid-payment).
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending && !done) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isPending, done, onClose]);

  if (!open) return null;

  const units = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending && !done) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl"
      >
        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={26} />
            </span>
            <h2 id="checkout-title" className="text-lg font-semibold text-slate-900">
              Payment received
            </h2>
            <p className="max-w-xs text-sm text-slate-500">
              Your order has been sent to {supplierName}. You can track it and download the invoice from Billing.
            </p>
            <button
              type="button"
              onClick={onViewOrder}
              className="mt-2 rounded-lg bg-[#3d6bff] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#3459d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40 focus-visible:ring-offset-2"
            >
              View order in billing
            </button>
          </div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="checkout-title" className="text-base font-semibold text-slate-900">
                  Review and pay
                </h2>
                <p className="text-xs text-slate-500">Nothing is charged until you confirm.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                aria-label="Close"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-5 overflow-y-auto px-5 py-5">
              {/* Items */}
              <section>
                <h3 className="mb-2 text-xs font-medium text-slate-600">
                  Order from {supplierName} · {units} {units === 1 ? "unit" : "units"}
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {lines.map((l) => (
                    <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-800">
                        {l.itemName} <span className="text-slate-400">× {l.quantity}</span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-slate-900">
                        {l.unitPrice !== null ? formatMoney(l.unitPrice * l.quantity, l.currency) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Delivery */}
              <section>
                <h3 className="mb-2 text-xs font-medium text-slate-600">Deliver to</h3>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{buyer.name}</p>
                  <p className="text-slate-500">{buyer.email}</p>
                  <p className="mt-1 whitespace-pre-line">{buyer.address}</p>
                  {buyer.notes && <p className="mt-1 text-xs text-slate-500">Note: {buyer.notes}</p>}
                </div>
              </section>

              {/* Payment method */}
              <fieldset disabled={isPending}>
                <legend className="mb-2 text-xs font-medium text-slate-600">Payment method</legend>
                <div className="space-y-2">
                  {METHODS.map((m) => {
                    const selected = method === m.id;
                    return (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition focus-within:ring-2 focus-within:ring-[#3d6bff]/30 ${
                          selected
                            ? "border-[#3d6bff] bg-[#3d6bff]/5"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          value={m.id}
                          checked={selected}
                          onChange={() => setMethod(m.id)}
                          className="sr-only"
                        />
                        <span className={selected ? "text-[#3d6bff]" : "text-slate-400"}>{m.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900">{m.label}</span>
                          <span className="block text-xs text-slate-500">{m.hint}</span>
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            selected ? "border-[#3d6bff]" : "border-slate-300"
                          }`}
                        >
                          {selected && <span className="h-2 w-2 rounded-full bg-[#3d6bff]" />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Totals */}
              <section className="rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  Tax and shipping are added to your final invoice, which you can download from Billing.
                </p>
              </section>

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>

            <footer className="space-y-2 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => onConfirm(method)}
                disabled={isPending}
                className="w-full rounded-lg bg-[#3d6bff] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#3459d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Processing payment…" : `Pay ${formatMoney(subtotal, currency)}`}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck size={12} />
                Your order is only placed once payment succeeds.
              </p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}