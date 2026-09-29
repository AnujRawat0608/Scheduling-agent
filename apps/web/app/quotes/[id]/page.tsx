"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, FileText, Building2, Truck, Hourglass } from "lucide-react";
import { fetchQuote, type ResponseLineItem } from "../../../lib/quotesAPI";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "—";
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₹";
  return `${symbol}${value.toLocaleString("en-IN")}`;
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: quote, isLoading, error } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => fetchQuote(id),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.responses.length ? false : 10_000),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  if (error || !quote) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Quote not found."}
        </div>
      </main>
    );
  }

  const response = quote.responses[0] ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <button
        onClick={() => router.push("/quotes")}
        className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft size={14} />
        Back to quotes
      </button>

      {quote.status === "sent" && (
        <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-[#f97316]" />
          <div>
            <h1 className="text-base font-semibold text-orange-900">
              RFQ {quote.referenceNumber} sent to {quote.supplierName}
            </h1>
            <p className="mt-1 text-sm text-orange-700">
              {quote.dueDate ? `Quote requested by ${formatDate(quote.dueDate)}` : "Awaiting response"}
            </p>
          </div>
        </div>
      )}

      {/* Quote summary */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#f97316]" />
          <h2 className="text-sm font-medium text-neutral-700">RFQ summary</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <span className="text-xs text-neutral-400">Reference</span>
            <div className="font-medium text-neutral-900">{quote.referenceNumber}</div>
          </div>
          <div>
            <span className="text-xs text-neutral-400">Sent</span>
            <div className="font-medium text-neutral-900">{formatDate(quote.createdAt)}</div>
          </div>
          <div>
            <span className="text-xs text-neutral-400">Quote due</span>
            <div className="font-medium text-neutral-900">{formatDate(quote.dueDate)}</div>
          </div>
          {quote.requiredDeliveryDate && (
            <div>
              <span className="text-xs text-neutral-400">Delivery needed by</span>
              <div className="font-medium text-neutral-900">{formatDate(quote.requiredDeliveryDate)}</div>
            </div>
          )}
          {quote.incoterm && (
            <div>
              <span className="text-xs text-neutral-400">Incoterm</span>
              <div className="font-medium text-neutral-900">{quote.incoterm}</div>
            </div>
          )}
          {quote.paymentTerms && (
            <div>
              <span className="text-xs text-neutral-400">Payment terms</span>
              <div className="font-medium text-neutral-900">{quote.paymentTerms}</div>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Spec</th>
                <th className="px-4 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {quote.lineItems.map((li, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-neutral-900">{li.productName}</td>
                  <td className="px-4 py-2 text-neutral-500">{li.specification || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                    {li.quantity} {li.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {quote.deliveryAddress && (
          <div className="flex items-start gap-2 text-sm">
            <Truck size={15} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              <span className="text-xs text-neutral-400">Delivery address</span>
              <p className="text-neutral-800">{quote.deliveryAddress}</p>
            </div>
          </div>
        )}

        {quote.scopeNotes && (
          <div className="flex items-start gap-2 text-sm">
            <FileText size={15} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              <span className="text-xs text-neutral-400">Scope notes</span>
              <p className="text-neutral-800">{quote.scopeNotes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Supplier response tracker */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[#f97316]" />
          <h2 className="text-sm font-medium text-neutral-700">Supplier response</h2>
        </div>

        {!response ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 p-5">
            <Hourglass size={20} className="shrink-0 animate-pulse text-[#f97316]" />
            <div>
              <p className="text-sm font-medium text-neutral-800">
                Waiting on {quote.supplierName}…
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                This page checks automatically — no need to refresh.
                {quote.dueDate && ` Quote requested by ${formatDate(quote.dueDate)}.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 size={15} />
              Quote received {formatDate(response.createdAt)}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <span className="text-xs text-neutral-400">Total price</span>
                <div className="text-lg font-semibold text-neutral-900">
                  {formatMoney(response.totalPrice, response.currency)}
                </div>
              </div>
              {response.leadTimeDays != null && (
                <div>
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    <Clock size={11} /> Lead time
                  </span>
                  <div className="font-medium text-neutral-900">{response.leadTimeDays} days</div>
                </div>
              )}
              {response.validUntil && (
                <div>
                  <span className="text-xs text-neutral-400">Valid until</span>
                  <div className="font-medium text-neutral-900">{formatDate(response.validUntil)}</div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Unit price</th>
                    <th className="px-4 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {response.lineItemQuotes.map((li: ResponseLineItem, i: number) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-4 py-2 font-medium text-neutral-900">{li.productName}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{li.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {formatMoney(li.unitPrice, response.currency)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-neutral-900">
                        {formatMoney(li.lineTotal, response.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50">
                    <td colSpan={3} className="px-4 py-2 text-sm font-medium text-neutral-700">
                      Total
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-neutral-900">
                      {formatMoney(response.totalPrice, response.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {response.notes && <p className="text-sm text-neutral-800">{response.notes}</p>}
          </div>
        )}
      </div>
    </main>
  );
}