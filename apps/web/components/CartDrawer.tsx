"use client";

import { useEffect } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { formatMoney } from "../lib/format";
import { useCart, type CartLine } from "../lib/cart";

/** Slide-over cart, grouped by supplier (each supplier is a separate order). */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, count, setQuantity, remove, clear } = useCart();

  // Close with Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Group by supplier.
  const groups = new Map<string, { name: string; currency: string; lines: CartLine[] }>();
  for (const l of lines) {
    const key = l.product.supplierId ?? l.product.supplierName;
    const g = groups.get(key) ?? { name: l.product.supplierName, currency: l.product.currency, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Cart">
      <button className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Close cart" />

      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <ShoppingCart size={18} />
            Your cart
            <span className="text-xs font-normal text-neutral-500">
              {count} {count === 1 ? "item" : "items"}
            </span>
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {lines.length === 0 && (
            <p className="py-10 text-center text-sm text-neutral-500">Your cart is empty.</p>
          )}

          {Array.from(groups.entries()).map(([key, g]) => {
            const subtotal = Math.round(g.lines.reduce((s, l) => s + l.product.unitPrice * l.quantity, 0) * 100) / 100;
            return (
              <section key={key} className="rounded-lg border border-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                  <span className="text-xs font-semibold text-neutral-800">{g.name}</span>
                  <span className="text-xs text-neutral-500">{formatMoney(subtotal, g.currency)}</span>
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
                        {formatMoney(Math.round(p.unitPrice * quantity * 100) / 100, p.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {lines.length > 0 && (
          <footer className="space-y-3 border-t border-neutral-200 px-5 py-4">
            <p className="text-[11px] text-neutral-500">
              Prices are in each supplier&apos;s own currency and exclude tax and shipping. Suppliers are
              ordered separately.
            </p>
            <button
              disabled
              title="Checkout isn't connected yet"
              className="w-full rounded-lg bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Checkout
            </button>
            <button onClick={clear} className="w-full text-xs text-neutral-500 hover:text-neutral-800">
              Clear cart
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}