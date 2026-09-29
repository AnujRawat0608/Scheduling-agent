"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Hourglass, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAllQuotes, type Quote, type QuoteStatus } from "../../lib/quotesAPI";

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  sent: "bg-orange-100 text-orange-700",
  quoted: "bg-green-100 text-green-700",
};

const FILTERS = ["all", "draft", "sent", "quoted"] as const;
type Filter = (typeof FILTERS)[number];

const PAGE_SIZE = 10;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function itemsSummary(q: Quote): string {
  if (!q.lineItems || q.lineItems.length === 0) return "—";
  const first = q.lineItems[0].productName;
  return q.lineItems.length > 1 ? `${first} +${q.lineItems.length - 1} more` : first;
}

function QuotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["quotes"],
    queryFn: fetchAllQuotes,
    // Keep the list fresh so a status flip from "sent" -> "quoted" (a
    // supplier responding) shows up without a manual refresh.
    refetchInterval: 15_000,
  });

  const quotes = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length };
    for (const q of quotes) c[q.status] = (c[q.status] ?? 0) + 1;
    return c;
  }, [quotes]);

  const filtered = useMemo(
    () => (filter === "all" ? quotes : quotes.filter((q) => q.status === filter)),
    [quotes, filter]
  );

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  useEffect(() => {
    if (!highlightId || isLoading) return;
    const idx = filtered.findIndex((q) => q.id === highlightId);
    if (idx !== -1) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      if (targetPage !== safePage) setPage(targetPage);
    }
  }, [highlightId, isLoading, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightId || isLoading) return;
    document.getElementById(`quote-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, isLoading, safePage]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-[#f97316]" />
          <h1 className="text-2xl font-semibold text-neutral-900">Quotes</h1>
        </div>
        <button
          onClick={() => router.push("/quotes/new")}
          className="flex items-center gap-1.5 rounded-md bg-[#f97316] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#f97316]/90"
        >
          <Plus size={15} />
          Send RFQ
        </button>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading quotes…</p>}

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Filter tabs */}
          <div className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316] ${
                  filter === s ? "bg-[#f97316] text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {s}
                <span className={`ml-1.5 text-xs ${filter === s ? "text-white/80" : "text-neutral-400"}`}>
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Quotes table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Supplier</th>
                  <th className="px-5 py-3">Item(s)</th>
                  <th className="px-5 py-3">Sent</th>
                  <th className="px-5 py-3">Due</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((q) => {
                  const isNew = highlightId !== null && q.id === highlightId;
                  return (
                    <tr
                      key={q.id}
                      id={`quote-${q.id}`}
                      className={`border-t border-neutral-100 ${isNew ? "bg-orange-50" : ""}`}
                    >
                      <td className="px-5 py-3 font-medium text-neutral-900">{q.referenceNumber}</td>
                      <td className="px-5 py-3 text-neutral-700">{q.supplierName}</td>
                      <td className="px-5 py-3 text-neutral-700">{itemsSummary(q)}</td>
                      <td className="px-5 py-3 text-neutral-500">{formatDate(q.createdAt)}</td>
                      <td className="px-5 py-3 text-neutral-500">{formatDate(q.dueDate)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[q.status]}`}
                        >
                          {q.status === "quoted" && <CheckCircle2 size={10} />}
                          {q.status === "sent" && <Hourglass size={10} />}
                          {q.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => router.push(`/quotes/${q.id}`)}
                          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-400">
                      {filter === "all" ? "No quotes sent yet." : `No ${filter} quotes.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span className="px-2 text-xs text-neutral-500">
                  Page {safePage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage === pageCount}
                  className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesContent />
    </Suspense>
  );
}