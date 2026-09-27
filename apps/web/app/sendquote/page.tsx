"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Plus, Send, Trash2 } from "lucide-react";
import {
  fetchSuppliers,
  saveQuote,
  type QuoteLineItem,
} from "../../lib/quotesApi";

/* ---------- Money helpers (paise-based, same pattern as billing) ---------- */
function toPaise(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

function formatINR(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function lineItemTotalPaise(item: QuoteLineItem): number {
  return toPaise(item.quantity * item.rate);
}

let nextId = 1;
function newLineItem(): QuoteLineItem {
  return { id: `new-${nextId++}`, productName: "", quantity: 0, rate: 0 };
}

export default function NewQuotePage() {
  const router = useRouter();

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const [supplierId, setSupplierId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState(
    () => `QT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`
  );
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([
    newLineItem(),
  ]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState("");

  const supplierName = useMemo(
    () => suppliers?.find((s) => s.id === supplierId)?.name ?? "",
    [suppliers, supplierId]
  );

  function updateLineItem(id: string, patch: Partial<QuoteLineItem>) {
    setLineItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeLineItem(id: string) {
    setLineItems((items) => items.filter((it) => it.id !== id));
  }

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, it) => sum + lineItemTotalPaise(it), 0);
    const discount = Math.round(subtotal * (discountPercent / 100));
    const tax = Math.round((subtotal - discount) * (taxPercent / 100));
    const shipping = toPaise(shippingCost);
    const grandTotal = subtotal - discount + tax + shipping;
    return { subtotal, discount, tax, shipping, grandTotal };
  }, [lineItems, discountPercent, taxPercent, shippingCost]);

  const hasValidLineItems = lineItems.some(
    (it) => it.productName.trim() && it.quantity > 0 && it.rate > 0
  );
  const canSubmit = Boolean(supplierId) && Boolean(dueDate) && hasValidLineItems;

  const saveMutation = useMutation({
    mutationFn: saveQuote,
    onSuccess: (quote) => {
      router.push(`/quotes?highlight=${quote.id}`);
    },
  });

  function submit(status: "draft" | "sent") {
    saveMutation.mutate({
      status,
      supplierId,
      supplierName,
      dueDate,
      referenceNumber,
      lineItems: lineItems.filter((it) => it.productName.trim()),
      discountPercent,
      taxPercent,
      shippingCost,
      notes,
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-[#3d6bff]" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Send quote</h1>
            <p className="text-sm text-neutral-500">Draft and send a quotation to a supplier for your RFQ.</p>
          </div>
        </div>
        <button
          onClick={() => submit("sent")}
          disabled={!canSubmit || saveMutation.isPending}
          className="flex items-center gap-1.5 rounded-md bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          <Send size={15} />
          {saveMutation.isPending && saveMutation.variables?.status === "sent" ? "Sending…" : "Send quote"}
        </button>
      </div>

      {saveMutation.isError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t save the quote: {(saveMutation.error as Error).message}. Try again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Quote information */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Quote information</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Supplier name</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                >
                  <option value="">{suppliersLoading ? "Loading…" : "Select a supplier"}</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Reference number</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">Line items</h2>
              <button
                onClick={() => setLineItems((items) => [...items, newLineItem()])}
                className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
              >
                <Plus size={14} /> Add item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium text-neutral-400">
                  <tr>
                    <th className="pb-2">Product name</th>
                    <th className="pb-2 text-right">Quantity</th>
                    <th className="pb-2 text-right">Rate</th>
                    <th className="pb-2 text-right">Total</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) => updateLineItem(item.id, { productName: e.target.value })}
                          placeholder="Search product…"
                          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          value={item.quantity || ""}
                          onChange={(e) => updateLineItem(item.id, { quantity: Number(e.target.value) })}
                          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.rate || ""}
                          onChange={(e) => updateLineItem(item.id, { rate: Number(e.target.value) })}
                          className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
                        />
                      </td>
                      <td className="py-2 pr-2 text-right font-medium tabular-nums text-neutral-900">
                        {formatINR(lineItemTotalPaise(item))}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => removeLineItem(item.id)}
                          aria-label="Remove line item"
                          className="text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="mb-3 text-base font-semibold text-neutral-900">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any terms, delivery instructions, or payment conditions…"
              rows={4}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff]"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Summary</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="tabular-nums text-neutral-900">{formatINR(totals.subtotal)}</span>
            </div>

            <div className="flex items-center justify-between text-neutral-600">
              <span className="flex items-center gap-1">
                Discount
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discountPercent || ""}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-12 rounded border border-neutral-200 px-1 py-0.5 text-right text-xs tabular-nums"
                />
                <span className="text-xs">%</span>
              </span>
              <span className="tabular-nums text-red-600">-{formatINR(totals.discount)}</span>
            </div>

            <div className="flex items-center justify-between text-neutral-600">
              <span className="flex items-center gap-1">
                Tax
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={taxPercent || ""}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="w-12 rounded border border-neutral-200 px-1 py-0.5 text-right text-xs tabular-nums"
                />
                <span className="text-xs">%</span>
              </span>
              <span className="tabular-nums text-neutral-900">{formatINR(totals.tax)}</span>
            </div>

            <div className="flex items-center justify-between text-neutral-600">
              <span className="flex items-center gap-1">
                Shipping
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={shippingCost || ""}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                  className="w-16 rounded border border-neutral-200 px-1 py-0.5 text-right text-xs tabular-nums"
                />
              </span>
              <span className="tabular-nums text-neutral-900">{formatINR(totals.shipping)}</span>
            </div>

            <div className="flex justify-between border-t border-neutral-200 pt-3 text-base font-semibold text-neutral-900">
              <span>Grand total</span>
              <span className="tabular-nums text-[#3d6bff]">{formatINR(totals.grandTotal)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <button
              onClick={() => submit("sent")}
              disabled={!canSubmit || saveMutation.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
            >
              <Send size={15} />
              {saveMutation.isPending && saveMutation.variables?.status === "sent" ? "Sending…" : "Send quote"}
            </button>
            <button
              onClick={() => submit("draft")}
              disabled={saveMutation.isPending}
              className="w-full rounded-md border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:opacity-50"
            >
              {saveMutation.isPending && saveMutation.variables?.status === "draft" ? "Saving…" : "Save as draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}