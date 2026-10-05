"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { formatMoney } from "../lib/format";
import { authHeaders } from "../lib/supplierAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface RfqLineItem {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
}

interface Rfq {
  id: string;
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  status: string; // "sent" | "quoted"
  currency: string | null;
  dueDate: string | null;
  requiredDeliveryDate: string | null;
  lineItems: RfqLineItem[];
  notes: string | null;
  deliveryAddress: string | null;
  isRead: boolean;
  createdAt: string;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/15";

/** The supplier is identified by their bearer token, same as the rest of the dashboard. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* -------------------------------------------------------------------------- */
/*  Quote form                                                                */
/* -------------------------------------------------------------------------- */

function QuoteForm({ rfq, onSent }: { rfq: Rfq; onSent: () => void }) {
  const [currency, setCurrency] = useState(rfq.currency ?? "INR");
  const [prices, setPrices] = useState<string[]>(() => rfq.lineItems.map(() => ""));
  const [leadTime, setLeadTime] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const lineTotals = rfq.lineItems.map((li, i) => {
    const p = Number(prices[i]);
    return Number.isFinite(p) && p > 0 ? round2(p * li.quantity) : 0;
  });
  const total = round2(lineTotals.reduce((a, b) => a + b, 0));

  async function submit() {
    setError(null);
    setSent(false);

    const allPriced = rfq.lineItems.every((_, i) => Number(prices[i]) > 0);
    if (!allPriced) return setError("Enter a unit price for every item.");
    const lead = Number(leadTime);
    if (leadTime.trim() === "" || !Number.isInteger(lead) || lead < 0) {
      return setError("Enter the lead time as a whole number of days.");
    }

    setSubmitting(true);
    try {
      await api(`/rfqs/me/${rfq.id}/quote`, {
        method: "POST",
        body: JSON.stringify({
          currency,
          leadTimeDays: lead,
          validUntil: validUntil || null,
          notes: notes.trim() || null,
          lineItemQuotes: rfq.lineItems.map((li, i) => ({
            productName: li.productName,
            quantity: li.quantity,
            unit: li.unit ?? "units",
            unitPrice: Number(prices[i]),
            lineTotal: lineTotals[i],
          })),
        }),
      });
      setSent(true);
      onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {rfq.status === "quoted" ? "Update your quote" : "Send your quote"}
        </h3>
        {rfq.status === "quoted" && (
          <span className="text-xs text-slate-500">Sending again replaces your earlier quote.</span>
        )}
      </div>

      <div className="space-y-2">
        {rfq.lineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem_7rem] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-800">{li.productName}</p>
              <p className="text-xs text-slate-400">
                {li.quantity} {li.unit ?? "units"}
              </p>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={prices[i]}
              onChange={(e) => setPrices((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
              placeholder="Unit price"
              aria-label={`Unit price for ${li.productName}`}
              className={inputClass}
            />
            <p className="text-right text-sm tabular-nums text-slate-700">
              {lineTotals[i] > 0 ? formatMoney(lineTotals[i], currency) : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Currency</span>
          <input
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Lead time (days)
          </span>
          <input
            type="number"
            min="0"
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Quote valid until
          </span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          className={`${inputClass} resize-none`}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {sent && !error && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 size={15} />
          Quote sent.
        </p>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-600">
          Total: <span className="font-semibold text-slate-900">{total > 0 ? formatMoney(total, currency) : "—"}</span>
        </p>
        {/* type="button": this sits inside the dashboard's profile <form>, so it must never submit it */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-[#3d6bff] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3d6bff]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : rfq.status === "quoted" ? "Update quote" : "Send quote"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inbox                                                                     */
/* -------------------------------------------------------------------------- */

export function RfqInbox() {
  const [rfqs, setRfqs] = useState<Rfq[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ rfqs: Rfq[] }>("/rfqs/me");
      setRfqs(data.rfqs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rfq: Rfq) {
    if (openId === rfq.id) {
      setOpenId(null);
      return;
    }
    setOpenId(rfq.id);
    if (!rfq.isRead) {
      try {
        await api(`/rfqs/me/${rfq.id}`); // opening an RFQ marks it read on the server
        setRfqs((prev) => prev?.map((r) => (r.id === rfq.id ? { ...r, isRead: true } : r)) ?? prev);
      } catch {
        /* not critical */
      }
    }
  }

  const unread = rfqs?.filter((r) => !r.isRead).length ?? 0;

  return (
    <section
      // This section lives inside the dashboard's profile <form>: stop Enter in an input from submitting it.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault();
      }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
            <FileText size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Requests for quote</h2>
            <p className="text-xs text-slate-500">Buyers asking you to quote on their orders</p>
          </div>
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-[#3d6bff] px-2.5 py-0.5 text-xs font-medium text-white">
            {unread} new
          </span>
        )}
      </header>

      {error && <p className="px-5 py-4 text-sm text-red-600 sm:px-6">Couldn't load RFQs: {error}</p>}

      {!error && rfqs === null && <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">Loading…</p>}

      {!error && rfqs !== null && rfqs.length === 0 && (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No requests yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
            When a buyer sends you an RFQ, it will show up here and you can quote on it.
          </p>
        </div>
      )}

      {rfqs?.map((rfq) => {
        const isOpen = openId === rfq.id;
        const summary = rfq.lineItems.map((li) => `${li.quantity} × ${li.productName}`).join(", ");
        return (
          <div key={rfq.id} className="border-b border-slate-100 last:border-0">
            <button
              type="button"
              onClick={() => toggle(rfq)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50/70 sm:px-6"
            >
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${rfq.isRead ? "bg-transparent" : "bg-[#3d6bff]"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{rfq.referenceNumber}</p>
                <p className="truncate text-xs text-slate-500">
                  From {rfq.requesterName} · {summary || "No items"}
                </p>
              </div>
              <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
                Reply by {formatDate(rfq.dueDate)}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  rfq.status === "quoted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {rfq.status === "quoted" ? "Quoted" : "Awaiting quote"}
              </span>
              {isOpen ? (
                <ChevronUp size={16} className="shrink-0 text-slate-400" />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-slate-400" />
              )}
            </button>

            {isOpen && (
              <div className="space-y-4 bg-slate-50/50 px-5 pb-5 pt-1 sm:px-6">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buyer contact</dt>
                    <dd className="text-slate-800">
                      {rfq.requesterName} · {rfq.requesterEmail}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Needed by
                    </dt>
                    <dd className="text-slate-800">{formatDate(rfq.requiredDeliveryDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reply by</dt>
                    <dd className="text-slate-800">{formatDate(rfq.dueDate)}</dd>
                  </div>
                  {rfq.deliveryAddress && (
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Deliver to
                      </dt>
                      <dd className="text-slate-800">{rfq.deliveryAddress}</dd>
                    </div>
                  )}
                  {rfq.notes && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes</dt>
                      <dd className="text-slate-800">{rfq.notes}</dd>
                    </div>
                  )}
                </dl>

                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2">Item</th>
                        <th className="px-4 py-2">Specification</th>
                        <th className="px-4 py-2 text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rfq.lineItems.map((li, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-slate-900">{li.productName}</td>
                          <td className="px-4 py-2 text-slate-600">{li.specification || "—"}</td>
                          <td className="px-4 py-2 text-right text-slate-700">
                            {li.quantity} {li.unit ?? "units"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <QuoteForm key={rfq.id} rfq={rfq} onSent={load} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}