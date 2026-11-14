"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";
import { formatMoney } from "../lib/format";
import { authHeaders } from "../lib/supplierAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface RfqLineItem {
  productName: string;
  specification?: string | null;
  unit?: string | null;
  quantity: number;
  /** Set on RFQs raised by the procurement agent: the supplier's advertised price, fixed for the quote. */
  unitPrice?: number | null;
  leadTimeDays?: number | null;
}

interface Rfq {
  id: string;
  referenceNumber: string;
  requesterName: string;
  requesterEmail: string;
  /** sent → quoted (final) → accepted, or quoted → revision_requested (buyer asked) → quoted */
  status: string; // "sent" | "quoted" | "revision_requested" | "accepted"
  currency: string | null;
  dueDate: string | null;
  requiredDeliveryDate: string | null;
  lineItems: RfqLineItem[];
  notes: string | null;
  deliveryAddress: string | null;
  isRead: boolean;
  createdAt: string;
  revisionNote?: string | null;
  revisionCount?: number;
  /** The supplier's reason, set when they declined a revision request and kept the original quote. */
  revisionReply?: string | null;
}

interface Attachment {
  id: string;
  fileName: string;
  sizeBytes: number;
}

interface SentQuote {
  id: string;
  currency: string | null;
  totalPrice: number | string | null;
  leadTimeDays: number | null;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  lineItemQuotes: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
}

interface RfqDetail {
  rfq: Rfq;
  attachments: Attachment[];
  quote: SentQuote | null;
}

type RfqState = "revision" | "awaiting" | "overdue" | "quoted";
type TabKey = "awaiting" | "revision" | "quoted" | "overdue" | "all";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/15";

/** Look of a field the supplier can read but not change. */
const lockedClass =
  "cursor-not-allowed bg-slate-100 text-slate-600 hover:border-slate-200 focus:border-slate-200 focus:bg-slate-100 focus:ring-0";

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

/** Files need the bearer token, so a plain link won't work: fetch the file and save it. */
async function downloadFile(rfqId: string, file: Attachment) {
  const res = await fetch(`${API_BASE}/rfqs/me/${rfqId}/files/${file.id}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Couldn't download the file");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * revision_requested → "revision" (the buyer wants a new quote: needs action);
 * quoted or accepted → "quoted"; not quoted and reply-by date before today → "overdue"; otherwise "awaiting".
 */
function getState(rfq: Rfq): RfqState {
  if (rfq.status === "revision_requested") return "revision";
  if (rfq.status === "quoted" || rfq.status === "accepted") return "quoted";
  if (rfq.dueDate) {
    const due = new Date(rfq.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!Number.isNaN(due.getTime()) && due.getTime() < today.getTime()) return "overdue";
  }
  return "awaiting";
}

const STATE_ORDER: Record<RfqState, number> = { revision: 0, awaiting: 1, overdue: 2, quoted: 3 };

function dueTime(rfq: Rfq): number {
  const t = rfq.dueDate ? new Date(rfq.dueDate).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

/** Actionable first (revision requests, then nearest deadline), then overdue, then already quoted. */
function sortRfqs(list: Rfq[]): Rfq[] {
  return [...list].sort((a, b) => {
    const s = STATE_ORDER[getState(a)] - STATE_ORDER[getState(b)];
    return s !== 0 ? s : dueTime(a) - dueTime(b);
  });
}

function badgeFor(rfq: Rfq): { label: string; className: string } {
  const state = getState(rfq);
  if (state === "revision") return { label: "Revision requested", className: "bg-orange-50 text-orange-700" };
  if (state === "overdue") return { label: "Overdue", className: "bg-red-50 text-red-700" };
  if (state === "quoted") {
    return rfq.status === "accepted"
      ? { label: "Accepted", className: "bg-emerald-100 text-emerald-800" }
      : { label: "Quoted", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "Awaiting quote", className: "bg-amber-50 text-amber-700" };
}

/** The lead time the supplier advertised, so the form can start from it (they only confirm it). */
function advertisedLeadTime(rfq: Rfq): number | null {
  const fromLines = rfq.lineItems
    .map((li) => li.leadTimeDays)
    .filter((d): d is number => typeof d === "number" && d >= 0);
  if (fromLines.length > 0) return Math.max(...fromLines);
  // RFQs raised by the agent mention it in the notes: "Your listed lead time is 2 days."
  const m = /lead time is (\d+) days?/i.exec(rfq.notes ?? "");
  return m ? Number(m[1]) : null;
}

/* -------------------------------------------------------------------------- */
/*  Sent quote (read-only): shown once a quote is final                       */
/* -------------------------------------------------------------------------- */

function SentQuotePanel({ rfq, quote, justSent }: { rfq: Rfq; quote: SentQuote | null; justSent: boolean }) {
  const accepted = rfq.status === "accepted";
  const currency = quote?.currency ?? rfq.currency ?? "INR";
  const total = quote?.totalPrice != null ? Number(quote.totalPrice) : null;

  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        accepted ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {accepted ? "Quote accepted" : justSent ? "Quote sent" : "Your quote has been sent"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {accepted
              ? "The buyer accepted your quote and placed an order. You can manage the order from your dashboard."
              : "It's final and can't be changed. If the buyer asks for changes, you'll get one chance to send a revised quote."}
          </p>
        </div>
      </div>

      {rfq.revisionReply && !accepted && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          You kept your original quote after the buyer&apos;s revision request: &ldquo;{rfq.revisionReply}&rdquo;
        </p>
      )}

      {quote ? (
        <>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</dt>
              <dd className="font-semibold text-slate-900">{total !== null ? formatMoney(total, currency) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead time</dt>
              <dd className="text-slate-800">{quote.leadTimeDays != null ? `${quote.leadTimeDays} days` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valid until</dt>
              <dd className="text-slate-800">{formatDate(quote.validUntil)}</dd>
            </div>
          </dl>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quote.lineItemQuotes.map((li, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-slate-900">{li.productName}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{li.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                      {formatMoney(Number(li.unitPrice), currency)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-900">
                      {formatMoney(Number(li.lineTotal), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {quote.notes && <p className="text-sm text-slate-700">{quote.notes}</p>}
        </>
      ) : (
        <p className="text-xs text-slate-500">Quote details aren&apos;t available.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quote form: only for "sent" and "revision_requested"                      */
/* -------------------------------------------------------------------------- */

function QuoteForm({
  rfq,
  previous,
  onSent,
  onDeclined,
}: {
  rfq: Rfq;
  /** The quote being revised (when the buyer asked for changes), used to pre-fill the form. */
  previous: SentQuote | null;
  onSent: () => void;
  /** Called after the supplier keeps their original quote instead of revising it. */
  onDeclined: () => void;
}) {
  const revising = rfq.status === "revision_requested";

  // Agent-raised RFQs carry the supplier's advertised price on every line. Those prices are fixed:
  // the form shows them read-only, and the server ignores any other value.
  const priceLocked = rfq.lineItems.length > 0 && rfq.lineItems.every((li) => typeof li.unitPrice === "number");
  // The advertised lead time is fixed too, when the RFQ tells us what it was.
  const leadLocked = priceLocked && advertisedLeadTime(rfq) !== null;

  const [currency, setCurrency] = useState(previous?.currency ?? rfq.currency ?? "INR");
  const [prices, setPrices] = useState<string[]>(() =>
    rfq.lineItems.map((li, i) => {
      if (priceLocked && typeof li.unitPrice === "number") return String(li.unitPrice);
      const prev = revising ? previous?.lineItemQuotes[i]?.unitPrice : undefined;
      return prev != null ? String(Number(prev)) : "";
    })
  );
  const [leadTime, setLeadTime] = useState(() => {
    if (revising && previous?.leadTimeDays != null) return String(previous.leadTimeDays);
    const d = advertisedLeadTime(rfq);
    return d === null ? "" : String(d);
  });
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lineTotals = rfq.lineItems.map((li, i) => {
    const p = Number(prices[i]);
    return Number.isFinite(p) && p > 0 ? round2(p * li.quantity) : 0;
  });
  const total = round2(lineTotals.reduce((a, b) => a + b, 0));

  async function submit() {
    setError(null);

    const allPriced = rfq.lineItems.every((_, i) => Number(prices[i]) > 0);
    if (!allPriced) return setError("Enter a unit price for every item.");
    const lead = Number(leadTime);
    if (leadTime.trim() === "" || !Number.isInteger(lead) || lead < 0) {
      return setError("Enter the lead time as a whole number of days.");
    }

    // A sent quote is final, so make the supplier confirm.
    const ok = window.confirm(
      revising
        ? "Send your revised quote? This is your one revision. You can't change it afterwards."
        : "Send this quote? Once sent it can't be changed unless the buyer asks for a revision."
    );
    if (!ok) return;

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
      onSent(); // the RFQ becomes "quoted", so this form is replaced by the read-only quote
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  /** "Revision not accepted": keep the original quote and tell the buyer why. */
  async function declineRevision() {
    setDeclineError(null);
    setDeclineBusy(true);
    try {
      await api(`/rfqs/me/${rfq.id}/decline-revision`, {
        method: "POST",
        body: JSON.stringify({ note: declineNote.trim() || null }),
      });
      onDeclined(); // the RFQ is "quoted" again, so this form is replaced by the read-only quote
    } catch (err) {
      setDeclineError((err as Error).message);
    } finally {
      setDeclineBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {revising ? "Send your revised quote" : "Send your quote"}
        </h3>
        <span className="text-xs text-slate-500">
          {revising ? "This is your one revision." : "Once sent, a quote can't be changed."}
        </span>
      </div>

      {revising && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <RefreshCw size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">The buyer asked for changes</p>
            <p className="mt-0.5 whitespace-pre-wrap text-orange-800">
              {rfq.revisionNote || "No details were given. Check the prices and reply."}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rfq.lineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem_7rem] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-800">{li.productName}</p>
              <p className="text-xs text-slate-400">
                {li.quantity} {li.unit ?? "units"}
              </p>
            </div>

            {priceLocked ? (
              <div className="relative">
                <Lock
                  size={12}
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  readOnly
                  value={prices[i]}
                  title="Fixed at the price you listed"
                  aria-label={`Unit price for ${li.productName} (fixed)`}
                  className={`${inputClass} ${lockedClass} pl-7 tabular-nums`}
                />
              </div>
            ) : (
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
            )}

            <p className="text-right text-sm tabular-nums text-slate-700">
              {lineTotals[i] > 0 ? formatMoney(lineTotals[i], currency) : "—"}
            </p>
          </div>
        ))}
      </div>

      {priceLocked && (
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Lock size={12} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            Unit price and lead time are fixed at the values on your product listing, as agreed when the buyer
            placed the request. If you can&apos;t supply on these terms, explain it in the notes instead of
            changing them.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Currency</span>
          <input
            value={currency}
            maxLength={3}
            readOnly={priceLocked}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className={`${inputClass} ${priceLocked ? lockedClass : ""}`}
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
            readOnly={leadLocked}
            onChange={(e) => setLeadTime(e.target.value)}
            title={leadLocked ? "Fixed at your listed lead time" : undefined}
            className={`${inputClass} ${leadLocked ? lockedClass : ""}`}
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

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-600">
          Total: <span className="font-semibold text-slate-900">{total > 0 ? formatMoney(total, currency) : "—"}</span>
        </p>
        {/* type="button": this may sit inside the dashboard's profile <form>, so it must never submit it */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-[#3d6bff] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3d6bff]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : revising ? "Send revised quote" : "Send quote"}
        </button>
      </div>

      {/* The supplier can't meet the buyer's request: keep the original quote */}
      {revising && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          {!declining ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                Can&apos;t meet the buyer&apos;s request? Your original quote stays as it is.
              </p>
              <button
                type="button"
                onClick={() => setDeclining(true)}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400"
              >
                Keep original quote
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reason for the buyer (optional)
                </span>
                <textarea
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="e.g. This is already our best price for this quantity."
                  className={`${inputClass} resize-none`}
                />
              </label>
              {declineError && (
                <p role="alert" className="text-sm text-red-600">
                  {declineError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={declineRevision}
                  disabled={declineBusy}
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {declineBusy ? "Sending…" : "Confirm: keep original quote"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeclining(false);
                    setDeclineError(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inbox                                                                     */
/* -------------------------------------------------------------------------- */

interface RfqInboxProps {
  /** Show only the first N RFQs (most urgent first). Used for the dashboard preview. */
  limit?: number;
  /** When set, shows an "Open RFQ inbox" link in the header and makes preview rows link there. */
  viewAllHref?: string;
  /** Show tabs + search (used on the full RFQ page). */
  showTabs?: boolean;
}

export function RfqInbox({ limit, viewAllHref, showTabs = false }: RfqInboxProps = {}) {
  const [rfqs, setRfqs] = useState<Rfq[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("awaiting");
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<Record<string, RfqDetail>>({});
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const isPreview = limit !== undefined;

  const load = useCallback(async () => {
    try {
      const data = await api<{ rfqs: Rfq[] }>("/rfqs/me");
      setRfqs(data.rfqs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  /** Full detail for one RFQ: files and the quote the supplier sent. Opening it also marks it read. */
  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<RfqDetail>(`/rfqs/me/${id}`);
      setDetails((prev) => ({ ...prev, [id]: { rfq: d.rfq, attachments: d.attachments ?? [], quote: d.quote ?? null } }));
      setRfqs((prev) => prev?.map((r) => (r.id === id ? { ...r, isRead: true } : r)) ?? prev);
    } catch {
      /* the list still works without the extras */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(rfq: Rfq) {
    setFileError(null);
    if (openId === rfq.id) {
      setOpenId(null);
      return;
    }
    setOpenId(rfq.id);
    await loadDetail(rfq.id);
  }

  async function handleSent(id: string) {
    setJustSentId(id);
    await load(); // status is now "quoted"
    await loadDetail(id); // fetch the quote that was just stored
  }

  async function handleDeclined(id: string) {
    await load(); // status is back to "quoted"
    await loadDetail(id);
  }

  async function handleDownload(rfqId: string, file: Attachment) {
    setFileError(null);
    try {
      await downloadFile(rfqId, file);
    } catch (err) {
      setFileError((err as Error).message);
    }
  }

  const unread = rfqs?.filter((r) => !r.isRead).length ?? 0;

  const counts = useMemo(() => {
    const c = { awaiting: 0, revision: 0, quoted: 0, overdue: 0, all: rfqs?.length ?? 0 };
    rfqs?.forEach((r) => {
      c[getState(r)] += 1;
    });
    return c;
  }, [rfqs]);

  const visible = useMemo(() => {
    if (!rfqs) return [];
    let list = sortRfqs(rfqs);

    if (isPreview) {
      // Preview: only requests that need action, unless nothing else is left.
      const active = list.filter((r) => {
        const s = getState(r);
        return s === "awaiting" || s === "revision";
      });
      list = active.length > 0 ? active : list;
      return list.slice(0, limit);
    }

    if (showTabs) {
      if (tab !== "all") list = list.filter((r) => getState(r) === tab);
      const q = query.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (r) =>
            r.referenceNumber.toLowerCase().includes(q) ||
            r.requesterName.toLowerCase().includes(q) ||
            r.lineItems.some((li) => li.productName.toLowerCase().includes(q))
        );
      }
    }
    return list;
  }, [rfqs, isPreview, limit, showTabs, tab, query]);

  const hiddenCount = isPreview && rfqs ? Math.max(0, rfqs.length - visible.length) : 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "awaiting", label: "Awaiting quote" },
    { key: "revision", label: "Revision requested" },
    { key: "quoted", label: "Quoted" },
    { key: "overdue", label: "Overdue" },
    { key: "all", label: "All" },
  ];

  return (
    <section
      // May live inside the dashboard's profile <form>: stop Enter in an input from submitting it.
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
            <p className="text-xs text-slate-500">
              {isPreview ? "Your most urgent requests" : "Buyers asking you to quote on their orders"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {counts.revision > 0 && (
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
              {counts.revision} revision{counts.revision === 1 ? "" : "s"} requested
            </span>
          )}
          {unread > 0 && (
            <span className="rounded-full bg-[#3d6bff] px-2.5 py-0.5 text-xs font-medium text-white">
              {unread} new
            </span>
          )}
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            >
              Open RFQ inbox
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </header>

      {showTabs && !isPreview && (
        <div className="space-y-3 border-b border-slate-100 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setOpenId(null);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  tab === t.key
                    ? "bg-[#3d6bff] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label} ({counts[t.key]})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by RFQ ID, buyer or product"
              aria-label="Search RFQs"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>
      )}

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

      {!error && rfqs !== null && rfqs.length > 0 && visible.length === 0 && (
        <p className="px-6 py-8 text-center text-sm text-slate-500">No requests match this view.</p>
      )}

      {visible.map((rfq) => {
        const isOpen = !isPreview && openId === rfq.id;
        const state = getState(rfq);
        const badge = badgeFor(rfq);
        const summary = rfq.lineItems.map((li) => `${li.quantity} × ${li.productName}`).join(", ");
        const detail = details[rfq.id];
        const canQuote = rfq.status === "sent" || rfq.status === "revision_requested";

        const rowContent = (
          <>
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
            <span
              className={`hidden shrink-0 text-xs sm:block ${
                state === "overdue" ? "font-medium text-red-600" : "text-slate-500"
              }`}
            >
              Reply by {formatDate(rfq.dueDate)}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {isPreview ? (
              <ArrowRight size={16} className="shrink-0 text-slate-400" />
            ) : isOpen ? (
              <ChevronUp size={16} className="shrink-0 text-slate-400" />
            ) : (
              <ChevronDown size={16} className="shrink-0 text-slate-400" />
            )}
          </>
        );

        const rowClass =
          "flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50/70 sm:px-6";

        return (
          <div key={rfq.id} className="border-b border-slate-100 last:border-0">
            {isPreview && viewAllHref ? (
              <Link href={viewAllHref} className={rowClass}>
                {rowContent}
              </Link>
            ) : (
              <button type="button" onClick={() => toggle(rfq)} aria-expanded={isOpen} className={rowClass}>
                {rowContent}
              </button>
            )}

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
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Needed by</dt>
                    <dd className="text-slate-800">{formatDate(rfq.requiredDeliveryDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reply by</dt>
                    <dd className="text-slate-800">{formatDate(rfq.dueDate)}</dd>
                  </div>
                  {rfq.deliveryAddress && (
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deliver to</dt>
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

                {/* CAD models and drawings the buyer attached */}
                {detail && detail.attachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Drawings & files
                    </p>
                    <ul className="space-y-1.5">
                      {detail.attachments.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <span className="truncate text-slate-800">{f.fileName}</span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="text-xs text-slate-400">{formatFileSize(f.sizeBytes)}</span>
                            <button
                              type="button"
                              onClick={() => handleDownload(rfq.id, f)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#3d6bff] hover:underline"
                            >
                              <Download size={13} /> Download
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {fileError && (
                      <p role="alert" className="text-xs text-red-600">
                        {fileError}
                      </p>
                    )}
                  </div>
                )}

                {/* Quote: a form while a quote is expected, read-only once it's sent */}
                {!detail ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : canQuote ? (
                  <QuoteForm
                    key={`${rfq.id}-${rfq.status}`}
                    rfq={rfq}
                    previous={detail.quote}
                    onSent={() => handleSent(rfq.id)}
                    onDeclined={() => handleDeclined(rfq.id)}
                  />
                ) : (
                  <SentQuotePanel rfq={rfq} quote={detail.quote} justSent={justSentId === rfq.id} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {isPreview && viewAllHref && hiddenCount > 0 && (
        <Link
          href={viewAllHref}
          className="flex items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs font-medium text-[#3d6bff] transition hover:bg-slate-50"
        >
          View all {rfqs?.length} requests
          <ArrowRight size={13} />
        </Link>
      )}
    </section>
  );
}