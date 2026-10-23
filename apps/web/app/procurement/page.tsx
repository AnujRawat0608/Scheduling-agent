"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ExternalLink, Check } from "lucide-react";
import {
  listProcurementTasks,
  fetchProcurementTask,
  type ProcurementTaskSummary,
} from "../../lib/procurementApi";
import { fetchTaskRfqs, type TaskRfq } from "../../lib/rfqQuotesApi";
import { formatMoney } from "../../lib/format";
import { RfqQuoteStatus, QuoteModal } from "../../components/RfqQuoteStatus";

// Keys must match the backend's status values exactly.
const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  needs_info: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-amber-100 text-amber-800",
  purchasing: "bg-[#EA580C]/10 text-[#EA580C]",
  rfq_sent: "bg-green-100 text-green-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

// A request counts as an "order" once the buyer has approved it.
const ORDER_STATUSES = ["purchasing", "rfq_sent", "done"];

function statusLabel(status: string): string {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

type Tab = "orders" | "quotes" | "all";

export default function ProcurementListPage() {
  const [tab, setTab] = useState<Tab>("orders");

  const { data, isLoading, error } = useQuery({
    queryKey: ["procurement-tasks"],
    queryFn: listProcurementTasks,
    refetchInterval: 5000,
  });

  const orders = (data ?? []).filter((t) => ORDER_STATUSES.includes(t.status));

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 pb-32 pt-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Your team</p>
            <h1 className="mt-1 text-lg font-semibold text-neutral-900">Orders &amp; quotes</h1>
          </div>
          <Link
            href="/procurement/new"
            className="rounded-lg bg-[#EA580C] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#EA580C]/90"
          >
            New request
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5">
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            Approved orders{data ? ` (${orders.length})` : ""}
          </TabButton>
          <TabButton active={tab === "quotes"} onClick={() => setTab("quotes")}>
            Quotes received
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All requests{data ? ` (${data.length})` : ""}
          </TabButton>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Failed to load: {(error as Error).message}
          </div>
        )}

        {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

        {data && tab === "orders" && (
          <TaskList
            tasks={orders}
            empty="No approved orders yet. Approve a plan on a request and it will appear here."
            render={(t) => <OrderCard key={t.id} task={t} />}
          />
        )}

        {data && tab === "all" && (
          <TaskList
            tasks={data}
            empty="No procurement requests yet."
            render={(t) => <RequestRow key={t.id} task={t} />}
          />
        )}

        {data && tab === "quotes" && <QuotesReceived orders={orders} />}
      </div>
    </main>
  );
}

function TaskList({
  tasks,
  empty,
  render,
}: {
  tasks: ProcurementTaskSummary[];
  empty: string;
  render: (task: ProcurementTaskSummary) => React.ReactNode;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
        {empty}
      </div>
    );
  }
  return <div className="space-y-3">{tasks.map(render)}</div>;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border bg-white px-3 py-1.5 text-[11px] font-medium transition ${
        active
          ? "border-[#EA580C] text-[#EA580C]"
          : "border-neutral-200 text-neutral-800 hover:border-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-neutral-100 text-neutral-600"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Plain row for the "All requests" tab: click to open the request. */
function RequestRow({ task }: { task: ProcurementTaskSummary }) {
  return (
    <Link
      href={`/procurement/${task.id}`}
      className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400"
    >
      <div>
        <div className="text-sm font-medium text-neutral-900">{task.itemsSummary}</div>
        <div className="text-xs text-neutral-500">{format(new Date(task.createdAt), "MMM d, h:mm a")}</div>
      </div>
      <StatusPill status={task.status} />
    </Link>
  );
}

/**
 * One approved order. Collapsed it shows the request; opened, it loads the request and shows each
 * supplier's RFQ with the quote they sent back (view the quote, accept it, see the order).
 * The request is only fetched when the card is opened, so a long list stays fast.
 */
function OrderCard({ task }: { task: ProcurementTaskSummary }) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["procurement", task.id],
    queryFn: () => fetchProcurementTask(task.id),
    enabled: open,
  });

  const results = data?.state.rfqResults ?? [];
  const sent = results.filter((r) => r.status === "sent");
  const failed = results.filter((r) => r.status === "failed");
  const requiredBy = data?.state.request?.requiredBy;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div>
          <div className="text-sm font-medium text-neutral-900">{task.itemsSummary}</div>
          <div className="text-xs text-neutral-500">
            Sent {format(new Date(task.createdAt), "MMM d, h:mm a")}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={task.status} />
          <ChevronDown
            size={16}
            className={`text-neutral-400 transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-neutral-100 p-4">
          {isLoading && <p className="text-xs text-neutral-500">Loading quotes…</p>}

          {isError && <p className="text-xs text-red-600">{(error as Error).message}</p>}

          {data && (
            <>
              {requiredBy && (
                <p className="text-xs text-neutral-500">
                  Needed by {new Date(requiredBy).toLocaleDateString()}
                </p>
              )}

              {sent.length > 0 ? (
                <div className="space-y-2 text-neutral-800">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Suppliers &amp; quotes
                  </h3>
                  <RfqQuoteStatus taskId={task.id} results={sent} />
                </div>
              ) : (
                <p className="text-xs text-neutral-500">
                  {task.status === "purchasing"
                    ? "Placing your order and sending requests to suppliers…"
                    : "No supplier requests were sent for this order."}
                </p>
              )}

              {failed.length > 0 && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  Couldn&apos;t send a request to {failed.map((r) => r.supplierName).join(", ")}.
                </p>
              )}

              <Link
                href={`/procurement/${task.id}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800"
              >
                Open full request
                <ExternalLink size={12} />
              </Link>
            </>
          )}
        </div>
      )}
    </article>
  );
}

type QuoteEntry = { task: ProcurementTaskSummary; rfq: TaskRfq };

/**
 * "Quotes received" tab: every quote a supplier has sent back, across all approved orders.
 * It only runs when the tab is open (one request per order), then checks again every 30 seconds.
 */
function QuotesReceived({ orders }: { orders: ProcurementTaskSummary[] }) {
  const [openEntry, setOpenEntry] = useState<QuoteEntry | null>(null);

  const results = useQueries({
    queries: orders.map((task) => ({
      queryKey: ["task-rfqs", task.id],
      queryFn: () => fetchTaskRfqs(task.id),
      staleTime: 15_000,
      refetchInterval: 30_000,
    })),
  });

  const stillLoading = results.some((r) => r.isLoading);
  const failedCount = results.filter((r) => r.isError).length;

  const entries: QuoteEntry[] = [];
  results.forEach((r, i) => {
    for (const rfq of r.data?.rfqs ?? []) {
      if (rfq.quote) entries.push({ task: orders[i], rfq });
    }
  });
  // Newest quote first.
  entries.sort(
    (a, b) =>
      new Date(b.rfq.quote?.createdAt ?? 0).getTime() - new Date(a.rfq.quote?.createdAt ?? 0).getTime()
  );

  // Keep the modal pointed at fresh data after an accept.
  const liveEntry = openEntry
    ? entries.find((e) => e.rfq.id === openEntry.rfq.id) ?? openEntry
    : null;

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
        No approved orders yet, so there are no quotes to show.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stillLoading && (
        <p className="text-xs text-neutral-500">Checking {orders.length} orders for quotes…</p>
      )}
      {failedCount > 0 && !stillLoading && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Couldn&apos;t check {failedCount} {failedCount === 1 ? "order" : "orders"} for quotes. Reload to try again.
        </p>
      )}

      {!stillLoading && entries.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          No supplier has sent a quote yet. They appear here as soon as a supplier replies.
        </div>
      )}

      {entries.map(({ task, rfq }) => {
        const quote = rfq.quote!;
        const currency = quote.currency ?? rfq.currency ?? "USD";
        return (
          <article
            key={rfq.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-neutral-900">{task.itemsSummary}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {rfq.supplier.businessName} · {rfq.referenceNumber} · received {fmtDate(quote.createdAt)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-600">
                <span className="font-semibold text-neutral-900">
                  {quote.totalPrice == null ? "—" : formatMoney(quote.totalPrice, currency)}
                </span>
                <span>
                  {quote.leadTimeDays == null
                    ? "Lead time —"
                    : `${quote.leadTimeDays} ${quote.leadTimeDays === 1 ? "day" : "days"} lead time`}
                </span>
                <span>Valid until {fmtDate(quote.validUntil)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {rfq.order ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <Check size={11} strokeWidth={3} />
                  Accepted
                </span>
              ) : (
                <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 text-xs font-medium text-[#EA580C]">
                  Awaiting your decision
                </span>
              )}
              <button
                onClick={() => setOpenEntry({ task, rfq })}
                className="rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10"
              >
                {rfq.order ? "View order" : "View quote"}
              </button>
            </div>
          </article>
        );
      })}

      {liveEntry && liveEntry.rfq.quote && (
        <QuoteModal rfq={liveEntry.rfq} taskId={liveEntry.task.id} onClose={() => setOpenEntry(null)} />
      )}
    </div>
  );
}