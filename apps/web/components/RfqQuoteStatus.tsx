"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, Clock, X } from "lucide-react";
import { formatMoney } from "../lib/format";
import { fetchTaskRfqs, type TaskRfq } from "../lib/rfqQuotesApi";

/** The part of an RFQ result this component needs (the page's own RfqResult type fits it). */
type RfqResultLike = {
  supplierId: string;
  supplierName: string;
  referenceNumber?: string | null;
  rfqId?: string | null;
  emailed?: boolean;
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/**
 * One line per supplier RFQ: email status + whether the supplier has replied with a quote.
 * "View quote" opens a modal with the quote details. Checks for replies every 15 seconds
 * until every supplier has quoted. A failed check never stops the polling.
 */
export function RfqQuoteStatus({ taskId, results }: { taskId: string; results: RfqResultLike[] }) {
  const [openRfqId, setOpenRfqId] = useState<string | null>(null);
  const closeModal = useCallback(() => setOpenRfqId(null), []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["task-rfqs", taskId],
    queryFn: () => fetchTaskRfqs(taskId),
    // Keep polling after an error too: one slow or failed response (Render waking up, a
    // network blip) must not freeze the status for good.
    refetchInterval: (query) => {
      const list = query.state.data?.rfqs ?? [];
      return list.length > 0 && list.every((r) => r.quote) ? false : 15_000;
    },
  });

  const rfqs = data?.rfqs ?? [];
  const openRfq = openRfqId ? (rfqs.find((r) => r.id === openRfqId) ?? null) : null;

  /** Match a result to its RFQ: by id, then reference number, then supplier. */
  function findRfq(r: RfqResultLike): TaskRfq | undefined {
    return (
      (r.rfqId ? rfqs.find((x) => x.id === r.rfqId) : undefined) ??
      (r.referenceNumber ? rfqs.find((x) => x.referenceNumber === r.referenceNumber) : undefined) ??
      rfqs.find((x) => x.supplier.id === r.supplierId)
    );
  }

  return (
    <>
      {results.map((r) => {
        const rfq = findRfq(r);
        return (
          <p key={r.supplierId} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span>
              {r.supplierName}
              {r.referenceNumber ? ` · ${r.referenceNumber}` : ""}
            </span>

            {/* Email status */}
            {r.emailed === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                <Check size={11} strokeWidth={3} />
                Email sent
              </span>
            )}
            {r.emailed === false && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                Email not delivered. The supplier will see it in their dashboard.
              </span>
            )}
            {r.emailed === undefined && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">
                Email status unknown. The supplier will see it in their dashboard.
              </span>
            )}

            {/* Quote status */}
            {rfq?.quote ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-medium text-[#EA580C]">
                  <Check size={11} strokeWidth={3} />
                  Quote received
                </span>
                <button
                  onClick={() => setOpenRfqId(rfq.id)}
                  className="rounded-md border border-[#EA580C] px-2 py-0.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10"
                >
                  View quote
                </button>
              </>
            ) : rfq ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">
                <Clock size={11} />
                Waiting for quote
              </span>
            ) : isLoading ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-500">
                <Clock size={11} />
                Checking for quote…
              </span>
            ) : isError && !data ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                <AlertCircle size={11} />
                Couldn't check for a quote. Retrying…
              </span>
            ) : (
              <span
                title="The server returned no RFQ record linked to this request and this supplier."
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-500"
              >
                <AlertCircle size={11} />
                Quote status unavailable
              </span>
            )}
          </p>
        );
      })}

      {openRfq?.quote && <QuoteModal rfq={openRfq} onClose={closeModal} />}
    </>
  );
}

function QuoteModal({ rfq, onClose }: { rfq: TaskRfq; onClose: () => void }) {
  const quote = rfq.quote!;
  const currency = quote.currency ?? rfq.currency ?? "USD";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Quote lines are in the same order as the RFQ's line items.
  const lines = quote.lineItemQuotes.map((li, i) => ({
    name: li.productName ?? rfq.lineItems[i]?.productName ?? `Item ${i + 1}`,
    quantity: li.quantity ?? rfq.lineItems[i]?.quantity,
    unitPrice: li.unitPrice,
    lineTotal: li.lineTotal,
    unit: li.unit ?? rfq.lineItems[i]?.unit ?? "",
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quote from ${rfq.supplier.businessName}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 text-neutral-900 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              Supplier quote
            </p>
            <h3 className="mt-1 text-sm font-semibold">{rfq.supplier.businessName}</h3>
            <p className="text-xs text-neutral-500">
              {rfq.referenceNumber} · received {fmtDate(quote.createdAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 transition hover:text-neutral-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">{l.name}</td>
                  <td className="px-3 py-2 text-right">
                    {l.quantity == null ? "—" : `${l.quantity} ${l.unit}`.trim()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.unitPrice == null ? "—" : formatMoney(l.unitPrice, currency)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.lineTotal == null ? "—" : formatMoney(l.lineTotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
          <span className="text-xs font-medium text-neutral-600">Quote total</span>
          <span className="text-sm font-semibold">
            {quote.totalPrice == null ? "—" : formatMoney(quote.totalPrice, currency)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Lead time</dt>
            <dd className="mt-0.5">
              {quote.leadTimeDays == null
                ? "—"
                : `${quote.leadTimeDays} ${quote.leadTimeDays === 1 ? "day" : "days"}`}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Valid until</dt>
            <dd className="mt-0.5">{fmtDate(quote.validUntil)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Payment terms</dt>
            <dd className="mt-0.5">{quote.paymentTerms || "—"}</dd>
          </div>
          {quote.notes && (
            <div className="col-span-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Notes from the supplier
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap">{quote.notes}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-[#EA580C] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#EA580C]/90"
          >
        Close
          </button>
        </div>
      </div>
    </div>
  );
}