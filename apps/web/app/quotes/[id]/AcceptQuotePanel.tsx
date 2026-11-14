"use client";

/* Save as app/quotes/[id]/AcceptQuotePanel.tsx and render it in page.tsx
 * right after the "Supplier response" card:
 *
 *   <AcceptQuotePanel rfq={quote} />
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, TriangleAlert, ShoppingCart, RefreshCw, Hourglass } from "lucide-react";
import { acceptQuoteForRfq, requestQuoteRevision, withdrawQuoteRevision } from "../../../lib/supplierOrdersApi";
import { formatMoney } from "../../../lib/format";
import type { QuoteDetail } from "../../../lib/quotesAPI";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Keep in sync with MAX_REVISIONS in routes/rfqRevision.ts */
const MAX_REVISIONS = 2;

const fieldCls =
  "w-full rounded-md border border-neutral-200 px-3 py-2.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ea580c]";

export default function AcceptQuotePanel({ rfq }: { rfq: QuoteDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Newest response first; the server only accepts the latest one.
  const response = rfq.responses[0];

  const [deliveryAddress, setDeliveryAddress] = useState(rfq.deliveryAddress ?? "");
  const [notes, setNotes] = useState("");
  const [revising, setRevising] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  const accept = useMutation({
    mutationFn: acceptQuoteForRfq,
    onSuccess: ({ order }) => {
      queryClient.invalidateQueries({ queryKey: ["quote", rfq.id] });
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
      router.push(`/billing?highlight=${order.id}`); // Billing highlights the new order; pay from there
    },
  });

  const revise = useMutation({
    mutationFn: requestQuoteRevision,
    onSuccess: () => {
      setRevising(false);
      setRevisionNote("");
      queryClient.invalidateQueries({ queryKey: ["quote", rfq.id] });
    },
  });

  const withdraw = useMutation({
    mutationFn: withdrawQuoteRevision,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quote", rfq.id] }),
  });

  /* ---- Accepted ---- */
  if (rfq.status === "accepted") {
    return (
      <section className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-green-800">
          <CircleCheck size={18} /> Quote accepted. An order has been created.
        </div>
        <Link href="/billing" className="mt-2 inline-block text-sm font-medium text-[#c2410c] hover:underline">
          Go to Billing to pay →
        </Link>
      </section>
    );
  }

  /* ---- Buyer asked for changes; waiting for the supplier's one new quote ---- */
  if (rfq.status === "revision_requested") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <Hourglass size={18} className="animate-pulse" /> Revision requested. Waiting for {rfq.supplierName}.
        </div>
        {rfq.revisionNote && (
          <p className="mt-2 text-sm text-amber-900">
            <span className="text-xs text-amber-700">You asked for:</span>
            <br />
            {rfq.revisionNote}
          </p>
        )}
        <p className="mt-2 text-xs text-amber-700">
          The quote above is the previous one and can&apos;t be accepted. This page updates automatically when
          the supplier replies.
        </p>
        {withdraw.isError && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {(withdraw.error as Error).message}
          </p>
        )}
        <button
          type="button"
          onClick={() => withdraw.mutate({ rfqId: rfq.id })}
          disabled={withdraw.isPending}
          className="mt-3 rounded-md border border-amber-300 bg-white px-4 py-2 text-xs font-medium text-amber-900 transition hover:border-amber-400 disabled:opacity-50"
        >
          {withdraw.isPending ? "Withdrawing…" : "Withdraw request & keep the previous quote"}
        </button>
      </section>
    );
  }

  if (rfq.status !== "quoted" || !response) return null;

  // Same rule as the server: valid through the end of the "valid until" day.
  const expired = response.validUntil ? new Date(response.validUntil).getTime() + DAY_MS < Date.now() : false;
  const addressOk = deliveryAddress.trim().length >= 5;
  const currency = response.currency ?? rfq.currency ?? "INR";

  // Agent RFQs have fixed catalog prices, so there is nothing to renegotiate.
  const lines = rfq.lineItems as unknown as { unitPrice?: number }[];
  const priceLocked = lines.length > 0 && lines.every((l) => typeof l.unitPrice === "number");
  const used = rfq.revisionCount ?? 0;
  const canRevise = !priceLocked && used < MAX_REVISIONS;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShoppingCart size={16} className="text-[#f97316]" />
        <h2 className="text-sm font-medium text-neutral-700">Accept this quote</h2>
      </div>

      {rfq.revisionReply && (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
          <p className="text-xs font-medium text-neutral-500">The supplier kept their original quote</p>
          <p className="mt-0.5 whitespace-pre-wrap">{rfq.revisionReply}</p>
        </div>
      )}

      {response.totalPrice != null && (
        <p className="mb-4 text-sm text-neutral-600">
          Quoted total{" "}
          <span className="font-semibold text-neutral-900">{formatMoney(response.totalPrice, currency)}</span>.
          Accepting creates your order. You pay for it on the Billing page, where any tax or shipping is shown
          before you confirm.
        </p>
      )}

      {expired && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          This quote has expired. {canRevise ? "Ask the supplier for a revised quote below." : "Ask the supplier for a new one."}
        </div>
      )}

      <label htmlFor="accept-address" className="mb-1.5 block text-[11px] text-neutral-600">
        Delivery address
      </label>
      <input id="accept-address" type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} className={fieldCls} />

      <label htmlFor="accept-notes" className="mb-1.5 mt-3 block text-[11px] text-neutral-600">
        Notes for the supplier (optional)
      </label>
      <textarea id="accept-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={fieldCls} />

      {accept.isError && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {(accept.error as Error).message}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            accept.mutate({ rfqId: rfq.id, quoteId: response.id, deliveryAddress: deliveryAddress.trim(), notes: notes.trim() })
          }
          disabled={accept.isPending || revise.isPending || expired || !addressOk}
          className="rounded-md bg-[#ea580c] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#c2410c] disabled:opacity-50"
        >
          {accept.isPending ? "Creating order…" : "Accept quote & continue to payment"}
        </button>

        {canRevise && !revising && (
          <button
            type="button"
            onClick={() => setRevising(true)}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-4 py-2.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
          >
            <RefreshCw size={13} /> Ask for a revision
          </button>
        )}
      </div>

      {/* Revision request */}
      {revising && (
        <div className="mt-5 rounded-xl border border-neutral-200 bg-[#FCFAF6] p-4">
          <p className="text-sm font-medium text-neutral-900">What would you like changed?</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            The supplier can then send one new quote. You can ask {MAX_REVISIONS - used} more{" "}
            {MAX_REVISIONS - used === 1 ? "time" : "times"} on this RFQ. If you&apos;re happy with the quote, just
            accept it instead.
          </p>
          <textarea
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. Can you do ₹110 per unit for 100 pcs, or deliver within 5 days?"
            className={`${fieldCls} mt-3`}
          />
          {revise.isError && (
            <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {(revise.error as Error).message}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => revise.mutate({ rfqId: rfq.id, note: revisionNote.trim() })}
              disabled={revise.isPending || revisionNote.trim().length < 5}
              className="rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {revise.isPending ? "Sending…" : "Send revision request"}
            </button>
            <button
              type="button"
              onClick={() => { setRevising(false); revise.reset(); }}
              className="rounded-md border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:border-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}