"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, X } from "lucide-react";
import { formatMoney } from "../lib/format";
import { acceptQuote, fetchTaskRfqs, type TaskRfq } from "../lib/rfqQuotesApi";
import { fetchCurrentProcurer } from "../lib/procurerAuthApi";
import { payForOrder } from "../lib/supplierPaymentApi";
import { CheckoutDialog } from "./CheckoutDialog";

/** The part of an RFQ result this component needs (the page's own RfqResult type fits it). */
type RfqResultLike = {
  supplierId: string;
  supplierName: string;
  referenceNumber?: string | null;
  rfqId?: string | null;
  emailed?: boolean;
};

// "pending" = placed but not paid. Paying moves the order to "confirmed".
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  confirmed: "Paid · confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
};

/** Order statuses that mean the buyer has paid. */
const PAID_STATUSES = ["confirmed", "shipped", "delivered"];

const round2 = (n: number) => Math.round(n * 100) / 100;
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/**
 * One line per supplier RFQ: email status + the supplier's quote status.
 * "View quote" opens a modal with the quote and, while it is still open, an "Accept quote" button
 * that places the order, then takes the buyer to payment. An order that is placed but unpaid shows
 * "Pay now". Checks for replies every 15 seconds (and when the tab regains focus)
 * until every supplier has quoted.
 */
export function RfqQuoteStatus({ taskId, results }: { taskId: string; results: RfqResultLike[] }) {
  const [openRfqId, setOpenRfqId] = useState<string | null>(null);
  const [startAtPayment, setStartAtPayment] = useState(false);

  function openModal(id: string, pay = false) {
    setStartAtPayment(pay);
    setOpenRfqId(id);
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["task-rfqs", taskId],
    queryFn: () => fetchTaskRfqs(taskId),
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const list = query.state.data?.rfqs ?? [];
      return list.length > 0 && list.every((r) => r.quote) ? false : 15_000;
    },
  });

  const rfqById = new Map<string, TaskRfq>((data?.rfqs ?? []).map((r) => [r.id, r]));
  const rfqBySupplier = new Map<string, TaskRfq>((data?.rfqs ?? []).map((r) => [r.supplier.id, r]));
  const openRfq = openRfqId ? rfqById.get(openRfqId) ?? null : null;

  return (
    <>
      {results.map((r) => {
        // Match by RFQ id, falling back to the supplier (there is one RFQ per task + supplier).
        const rfq = (r.rfqId ? rfqById.get(r.rfqId) : undefined) ?? rfqBySupplier.get(r.supplierId);
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
            {isLoading ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-500">
                Checking for quote…
              </span>
            ) : isError ? (
              <span
                title={(error as Error)?.message}
                className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700"
              >
                Couldn&apos;t check for a quote{(error as Error)?.message ? `: ${(error as Error).message}` : ""}
              </span>
            ) : rfq?.order ? (
              PAID_STATUSES.includes(rfq.order.status) ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">
                    <Check size={11} strokeWidth={3} />
                    Paid · Order #{shortId(rfq.order.id)}
                  </span>
                  <button
                    onClick={() => openModal(rfq.id)}
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    View order
                  </button>
                </>
              ) : rfq.order.status === "pending" ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                    <Clock size={11} />
                    Order placed · Awaiting payment
                  </span>
                  <button
                    onClick={() => openModal(rfq.id, true)}
                    className="rounded-md bg-[#EA580C] px-2 py-0.5 text-[11px] font-medium text-white transition hover:bg-[#EA580C]/90"
                  >
                    Pay now
                  </button>
                  <button
                    onClick={() => openModal(rfq.id)}
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    View order
                  </button>
                </>
              ) : (
                <>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">
                    Order #{shortId(rfq.order.id)} · {ORDER_STATUS_LABEL[rfq.order.status] ?? rfq.order.status}
                  </span>
                  <button
                    onClick={() => openModal(rfq.id)}
                    className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    View order
                  </button>
                </>
              )
            ) : rfq?.quote ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-medium text-[#EA580C]">
                  <Check size={11} strokeWidth={3} />
                  Quote received
                </span>
                <button
                  onClick={() => openModal(rfq.id)}
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
            ) : (
              <span
                title="The server didn't return this RFQ for the signed-in buyer."
                className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
              >
                Quote status unavailable
              </span>
            )}
          </p>
        );
      })}

      {openRfq?.quote && (
        <QuoteModal
          rfq={openRfq}
          taskId={taskId}
          startAtPayment={startAtPayment}
          onClose={() => setOpenRfqId(null)}
        />
      )}
    </>
  );
}

export function QuoteModal({
  rfq,
  taskId,
  onClose,
  startAtPayment = false,
}: {
  rfq: TaskRfq;
  taskId: string;
  onClose: () => void;
  /** Open straight on the payment step (used by the "Pay now" buttons). */
  startAtPayment?: boolean;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const quote = rfq.quote!;
  const currency = quote.currency ?? rfq.currency ?? "USD";

  const [confirming, setConfirming] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  // Payment window: opens right after the order is placed, or from "Pay now" on an unpaid order.
  const [checkoutOpen, setCheckoutOpen] = useState(startAtPayment && rfq.order?.status === "pending");

  // The signed-in buyer, used to pre-fill the payment window. Shares the cache with the profile menu.
  const { data: me } = useQuery({
    queryKey: ["procurer", "me"],
    queryFn: fetchCurrentProcurer,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const buyerName = me?.contactName || me?.companyName || "";
  const buyerEmail = me?.email ?? "";

  const accept = useMutation({
    mutationFn: () =>
      acceptQuote(rfq.id, { quoteId: quote.id, deliveryAddress: address.trim(), notes: notes.trim() || undefined }),
    // The order now exists but is unpaid: go straight to payment.
    onSuccess: () => setCheckoutOpen(true),
    // Refresh either way: after an error the supplier's quote may have changed.
    onSettled: () => qc.invalidateQueries({ queryKey: ["task-rfqs", taskId] }),
  });

  // Fresh data from the server wins over what the accept call returned a moment ago.
  const order = rfq.order ?? accept.data?.order ?? null;

  const pay = useMutation({
    mutationFn: () => payForOrder({ orderId: order?.id ?? null, buyerName, buyerEmail }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task-rfqs", taskId] });
      qc.invalidateQueries({ queryKey: ["supplier-orders"] });
    },
  });

  const isPaid = !!order && (pay.isSuccess || PAID_STATUSES.includes(order.status));
  const isUnpaid = !!order && !isPaid && order.status === "pending";

  function closeCheckout() {
    if (pay.isPending) return;
    pay.reset();
    setCheckoutOpen(false);
  }

  // Escape closes the quote window, but never while the payment window is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !checkoutOpen && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, checkoutOpen]);

  // Quote lines are in the same order as the RFQ's line items.
  const lines = quote.lineItemQuotes.map((li, i) => {
    const quantity = li.quantity ?? rfq.lineItems[i]?.quantity;
    const amount =
      li.unitPrice != null && quantity != null ? round2(li.unitPrice * quantity) : li.lineTotal;
    return {
      name: li.productName ?? rfq.lineItems[i]?.productName ?? `Item ${i + 1}`,
      quantity,
      unitPrice: li.unitPrice,
      amount,
    };
  });

  // The order is built from unit price x quantity, so show the same figure here.
  const orderTotal =
    lines.length > 0 && lines.every((l) => l.amount != null)
      ? round2(lines.reduce((sum, l) => sum + (l.amount as number), 0))
      : quote.totalPrice;

  const canAccept = rfq.status === "quoted" && !order;

  return (
    <>
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
                    <td className="px-3 py-2 text-right">{l.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.unitPrice == null ? "—" : formatMoney(l.unitPrice, currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.amount == null ? "—" : formatMoney(l.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5">
            <span className="text-xs font-medium text-neutral-600">Quote total</span>
            <span className="text-sm font-semibold">
              {orderTotal == null ? "—" : formatMoney(orderTotal, currency)}
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

          {/* Order placed but not paid yet */}
          {isUnpaid && order && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <Clock size={13} />
                Order placed · payment pending
              </p>
              <p className="mt-1">
                Order #{shortId(order.id)}
                {order.total != null ? ` · ${formatMoney(order.total, order.currency)}` : ""}. The supplier is
                notified once you have paid.
              </p>
              <button
                onClick={() => setCheckoutOpen(true)}
                className="mt-3 rounded-md bg-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#EA580C]/90"
              >
                Pay now
              </button>
            </div>
          )}

          {/* Paid */}
          {isPaid && order && (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">
              <p className="flex items-center gap-1.5 font-semibold">
                <Check size={13} strokeWidth={3} />
                Quote accepted and paid
              </p>
              <p className="mt-1">
                Order #{shortId(order.id)} ·{" "}
                {pay.isSuccess ? ORDER_STATUS_LABEL.confirmed : ORDER_STATUS_LABEL[order.status] ?? order.status}
                {order.total != null ? ` · ${formatMoney(order.total, order.currency)}` : ""}
              </p>
              <p className="mt-1 text-green-700">The supplier has been notified about this order.</p>
              <Link
                href={`/billing?highlight=${order.id}`}
                className="mt-3 inline-block rounded-md border border-green-300 bg-white px-3 py-1.5 text-[11px] font-medium text-green-800 transition hover:bg-green-100"
              >
                View order in billing
              </Link>
            </div>
          )}

          {/* Any other order state (for example cancelled) */}
          {order && !isPaid && !isUnpaid && (
            <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
              Order #{shortId(order.id)} · {ORDER_STATUS_LABEL[order.status] ?? order.status}
            </div>
          )}

          {/* Still open: accept form */}
          {canAccept && confirming && (
            <div className="mt-5 rounded-lg border border-[#EA580C]/30 bg-[#EA580C]/5 p-3">
              <p className="text-xs font-semibold">Accept this quote and place the order</p>
              <p className="mt-1 text-[11px] text-neutral-600">
                Order total {orderTotal == null ? "—" : formatMoney(orderTotal, currency)}, based on the
                supplier&apos;s quote. You&apos;ll pay on the next step.
              </p>

              <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Delivery address
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Where should the supplier deliver?"
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-neutral-900 outline-none focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/20"
                />
              </label>

              <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Notes for the supplier (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-neutral-900 outline-none focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/20"
                />
              </label>

              {accept.isError && <p className="mt-2 text-xs text-red-600">{(accept.error as Error).message}</p>}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={accept.isPending}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-300 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending || address.trim().length < 5}
                  className="rounded-md bg-[#EA580C] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
                >
                  {accept.isPending ? "Placing order…" : "Confirm & continue to payment"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
            >
              Close
            </button>
            {canAccept && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md bg-[#EA580C] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#EA580C]/90"
              >
                Accept quote
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rendered beside the quote window (not inside it) so clicks in it never close the quote window. */}
      {order && (
        <CheckoutDialog
          open={checkoutOpen}
          supplierName={rfq.supplier.businessName}
          lines={lines.map((l, i) => ({
            key: String(i),
            itemName: l.name,
            quantity: l.quantity ?? 1,
            unitPrice: l.unitPrice ?? null,
            currency,
          }))}
          currency={order.currency ?? currency}
          subtotal={order.total ?? orderTotal ?? 0}
          buyer={{ name: buyerName, email: buyerEmail, address: address.trim(), notes: notes.trim() }}
          isPending={pay.isPending}
          error={pay.isError ? (pay.error as Error).message : null}
          done={pay.isSuccess}
          onConfirm={() => pay.mutate()}
          onClose={closeCheckout}
          onViewOrder={() => router.push(`/billing?highlight=${order.id}`)}
        />
      )}
    </>
  );
}