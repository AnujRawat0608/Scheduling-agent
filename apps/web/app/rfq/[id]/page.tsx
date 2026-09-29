"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  Building2,
  Truck,
  ShieldCheck,
  Hourglass,
} from "lucide-react";
import { fetchRfq, type RfqLineItemQuote } from "../../../lib/rfqApi";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatMoney(value: number | null, currency: string | null) {
  if (value === null) return "—";
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₹";
  return `${symbol}${value.toLocaleString("en-IN")}`;
}

export default function RfqStatusPage() {
  const params = useParams();
  const rfqId = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["rfq", rfqId],
    queryFn: () => fetchRfq(rfqId),
    enabled: !!rfqId,
    // Keep checking for a quote every 10s while none has arrived yet.
    // Once a quote exists, there's nothing left to wait on, so stop polling.
    refetchInterval: (query) => (query.state.data?.rfq.quotes.length ? false : 10_000),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading RFQ…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "RFQ not found."}
        </div>
      </main>
    );
  }

  const { rfq } = data;
  const quote = rfq.quotes[0] ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      {/* Confirmation banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-green-600" />
        <div>
          <h1 className="text-base font-semibold text-green-900">
            RFQ {rfq.referenceNumber} sent to {rfq.supplier?.businessName ?? "the supplier"}
          </h1>
          <p className="mt-1 text-sm text-green-700">
            Sent to {rfq.requesterEmail === rfq.supplier?.contactName ? "" : rfq.supplier?.contactName ?? "the supplier"}
            {rfq.dueDate ? ` · quote requested by ${formatDate(rfq.dueDate)}` : ""}
          </p>
        </div>
      </div>

      {/* RFQ summary */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#c2410c]" />
          <h2 className="text-sm font-medium text-neutral-700">RFQ summary</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <span className="text-xs text-neutral-400">Reference</span>
            <div className="font-medium text-neutral-900">{rfq.referenceNumber}</div>
          </div>
          <div>
            <span className="text-xs text-neutral-400">Sent</span>
            <div className="font-medium text-neutral-900">{formatDate(rfq.createdAt)}</div>
          </div>
          <div>
            <span className="text-xs text-neutral-400">Quote due</span>
            <div className="font-medium text-neutral-900">{formatDate(rfq.dueDate)}</div>
          </div>
          {rfq.requiredDeliveryDate && (
            <div>
              <span className="text-xs text-neutral-400">Delivery needed by</span>
              <div className="font-medium text-neutral-900">{formatDate(rfq.requiredDeliveryDate)}</div>
            </div>
          )}
          {rfq.incoterm && (
            <div>
              <span className="text-xs text-neutral-400">Incoterm</span>
              <div className="font-medium text-neutral-900">{rfq.incoterm}</div>
            </div>
          )}
          {rfq.paymentTerms && (
            <div>
              <span className="text-xs text-neutral-400">Payment terms</span>
              <div className="font-medium text-neutral-900">{rfq.paymentTerms}</div>
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
              {rfq.lineItems.map((li, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-neutral-900">{li.productName}</td>
                  <td className="px-4 py-2 text-neutral-500">{li.specification ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                    {li.quantity} {li.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rfq.deliveryAddress && (
          <div className="flex items-start gap-2 text-sm">
            <Truck size={15} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              <span className="text-xs text-neutral-400">Delivery address</span>
              <p className="text-neutral-800">{rfq.deliveryAddress}</p>
            </div>
          </div>
        )}

        {rfq.scopeNotes && (
          <div className="flex items-start gap-2 text-sm">
            <FileText size={15} className="mt-0.5 shrink-0 text-neutral-400" />
            <div>
              <span className="text-xs text-neutral-400">Scope notes</span>
              <p className="text-neutral-800">{rfq.scopeNotes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Quote tracker */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-[#c2410c]" />
          <h2 className="text-sm font-medium text-neutral-700">Supplier response</h2>
        </div>

        {!quote ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 p-5">
            <Hourglass size={20} className="shrink-0 animate-pulse text-[#c2410c]" />
            <div>
              <p className="text-sm font-medium text-neutral-800">
                Waiting on {rfq.supplier?.businessName ?? "the supplier"}…
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                This page checks automatically every few seconds — no need to refresh.
                {rfq.dueDate && ` Quote requested by ${formatDate(rfq.dueDate)}.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 size={15} />
              Quote received {formatDate(quote.createdAt)}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <span className="text-xs text-neutral-400">Total price</span>
                <div className="text-lg font-semibold text-neutral-900">
                  {formatMoney(quote.totalPrice, quote.currency)}
                </div>
              </div>
              {quote.leadTimeDays != null && (
                <div>
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <Clock size={11} /> Lead time
                  </span>
                  <div className="font-medium text-neutral-900">{quote.leadTimeDays} days</div>
                </div>
              )}
              {quote.validUntil && (
                <div>
                  <span className="text-xs text-neutral-400">Valid until</span>
                  <div className="font-medium text-neutral-900">{formatDate(quote.validUntil)}</div>
                </div>
              )}
              {quote.paymentTerms && (
                <div>
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <ShieldCheck size={11} /> Payment terms
                  </span>
                  <div className="font-medium text-neutral-900">{quote.paymentTerms}</div>
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
                  {quote.lineItemQuotes.map((li: RfqLineItemQuote, i: number) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-4 py-2 font-medium text-neutral-900">{li.productName}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{li.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                        {formatMoney(li.unitPrice, quote.currency)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-neutral-900">
                        {formatMoney(li.lineTotal, quote.currency)}
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
                      {formatMoney(quote.totalPrice, quote.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {quote.notes && (
              <div className="flex items-start gap-2 text-sm">
                <Mail size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                <p className="text-neutral-800">{quote.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}