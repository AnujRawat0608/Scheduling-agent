"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, TriangleAlert, X, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAllSupplierOrders, confirmSupplierOrder, type SupplierOrder } from "../../lib/supplierOrdersApi";
import { formatMoney } from "../../lib/format";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const FILTERS = ["all", "pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

const PAGE_SIZE = 10;

/* ---------- Money helpers ---------- */
// Amounts are handled in minor units (cents/paise) so sums stay exact, and every order
// is shown in ITS OWN currency. Orders in different currencies are never added together.

/** Order money fields are order-level rollups (summed across items on the backend). */
function toMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹$€£,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** The currency an order was placed in. Orders saved before currencies existed were backfilled as USD. */
function currencyOf(o: SupplierOrder): string {
  return o.currency || "USD";
}

function formatMinor(minor: number, currency: string) {
  return formatMoney(minor / 100, currency);
}

function subtotalMinor(o: SupplierOrder): number | null {
  return toMinor(o.subtotal);
}

function taxMinor(o: SupplierOrder): number {
  return toMinor(o.taxAmount) ?? 0;
}

function shippingMinor(o: SupplierOrder): number {
  return toMinor(o.shippingCost) ?? 0;
}

/** The backend already computes this as subtotal + tax + shipping across
 * all items; fall back to computing it client-side only if `total` itself
 * is missing (e.g. an order created before this field existed). */
function lineTotal(o: SupplierOrder): number | null {
  const fromServer = toMinor(o.total);
  if (fromServer !== null) return fromServer;

  const sub = subtotalMinor(o);
  if (sub === null) return null;
  return sub + taxMinor(o) + shippingMinor(o);
}

/** Every item that does carry a unit price, summed — used in the detail
 * modal's per-item breakdown, not for the order-level total (that's
 * o.subtotal/o.total, computed server-side). */
function itemLineTotal(item: SupplierOrder["items"][number]): number | null {
  const unit = toMinor(item.unitPrice);
  if (unit === null) return null;
  return unit * item.quantity;
}

/** Sum order totals separately for each currency. */
function sumByCurrency(orders: SupplierOrder[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const o of orders) {
    const t = lineTotal(o);
    if (t === null) continue;
    const cur = currencyOf(o);
    totals.set(cur, (totals.get(cur) ?? 0) + t);
  }
  return totals;
}

/** One line per currency, e.g. "$12,345.00" and "€88.98". */
function MoneyTotals({ totals }: { totals: Map<string, number> }) {
  const entries = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    <>
      {entries.map(([cur, minor]) => (
        <div key={cur}>{formatMinor(minor, cur)}</div>
      ))}
    </>
  );
}

const totalQuantity = (o: SupplierOrder) => o.items.reduce((sum, item) => sum + item.quantity, 0);

/** Short summary for the table's Item column: the first item's name, plus
 * a "+N more" suffix when the order has additional line items. */
function itemsSummary(o: SupplierOrder): string {
  if (o.items.length === 0) return "—";
  const first = o.items[0].itemName;
  return o.items.length > 1 ? `${first} +${o.items.length - 1} more` : first;
}

/* ---------- Order detail / invoice modal ---------- */
function OrderDetailModal({ order, onClose }: { order: SupplierOrder; onClose: () => void }) {
  const currency = currencyOf(order);
  const sub = subtotalMinor(order);
  const tax = taxMinor(order);
  const shipping = shippingMinor(order);
  const total = lineTotal(order);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#c2410c]" />
            <h2 className="text-base font-semibold text-neutral-900">Order details</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Order meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-neutral-400">Order ID</span>
              <div className="truncate font-medium text-neutral-900">{order.id}</div>
            </div>
            <div>
              <span className="text-xs text-neutral-400">Date</span>
              <div className="font-medium text-neutral-900">
                {new Date(order.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
            <div>
              <span className="text-xs text-neutral-400">Status</span>
              <div>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_STYLES[order.status] ?? ""
                  }`}
                >
                  {order.status}
                </span>
              </div>
            </div>
            <div>
              <span className="text-xs text-neutral-400">Requester</span>
              <div className="font-medium text-neutral-900">{order.requesterName}</div>
              <div className="text-xs text-neutral-400">{order.requesterEmail}</div>
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <span className="text-xs text-neutral-400">Delivery address</span>
            <p className="text-sm text-neutral-800">{order.deliveryAddress}</p>
          </div>

          {order.notes && (
            <div>
              <span className="text-xs text-neutral-400">Notes</span>
              <p className="text-sm text-neutral-800">{order.notes}</p>
            </div>
          )}

          {/* Line items */}
          <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
              <span>
                {order.items.length} {order.items.length === 1 ? "item" : "items"}
              </span>
              <span>Priced in {currency}</span>
            </div>

            <div className="divide-y divide-neutral-100">
              {order.items.map((item) => {
                const unit = toMinor(item.unitPrice);
                const itemTotal = itemLineTotal(item);
                return (
                  <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-neutral-900">{item.itemName}</span>
                      <span className="text-neutral-500">Qty {item.quantity}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                      <span>{unit !== null ? `${formatMinor(unit, currency)} / unit` : "No unit price recorded"}</span>
                      {itemTotal !== null && <span className="tabular-nums">{formatMinor(itemTotal, currency)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-1 space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{sub !== null ? formatMinor(sub, currency) : "—"}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Tax</span>
                <span className="tabular-nums">{formatMinor(tax, currency)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Shipping</span>
                <span className="tabular-nums">{shipping > 0 ? formatMinor(shipping, currency) : "Free"}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
                <span>Total</span>
                <span className="tabular-nums">{total !== null ? formatMinor(total, currency) : "—"}</span>
              </div>
            </div>
          </div>

          {sub === null && (
            <p className="text-xs text-neutral-400">
              No priced items were recorded for this order (placed without a linked product, or the product had
              no price set at order time).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingContent() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<SupplierOrder | null>(null);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-orders"],
    queryFn: fetchAllSupplierOrders,
    refetchOnMount: "always",
  });

  const confirmOrder = useMutation({
    mutationFn: confirmSupplierOrder,
    onSuccess: () => {
      setConfirmedMessage("Order confirmed.");
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
    },
  });

  useEffect(() => {
    if (!confirmedMessage) return;
    const t = setTimeout(() => setConfirmedMessage(null), 3000);
    return () => clearTimeout(t);
  }, [confirmedMessage]);

  const orders = useMemo(
    () =>
      [...(data?.orders ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [data]
  );

  const billable = useMemo(() => orders.filter((o) => o.status !== "cancelled"), [orders]);
  const cancelledCount = orders.length - billable.length;
  const missingPrice = useMemo(() => billable.filter((o) => lineTotal(o) === null), [billable]);

  // Totals are kept per currency: dollars, euros and rupees are never added together.
  const totals = useMemo(() => {
    const open = billable.filter((o) => o.status !== "delivered");
    const delivered = billable.filter((o) => o.status === "delivered");
    return {
      total: sumByCurrency(billable),
      outstanding: sumByCurrency(open),
      delivered: sumByCurrency(delivered),
    };
  }, [billable]);

  const hasMultipleCurrencies = totals.total.size > 1;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );
  const filteredSubtotal = useMemo(
    () => sumByCurrency(filtered.filter((o) => o.status !== "cancelled")),
    [filtered]
  );

  // Reset to page 1 whenever the filter changes or the underlying data
  // reloads with a different row count, so you're never stranded on a
  // page number that no longer exists.
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
    // If the highlighted order isn't on the current page, jump to
    // whichever page it's actually on before scrolling to it.
    const idx = filtered.findIndex((o) => String(o.id) === highlightId);
    if (idx !== -1) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      if (targetPage !== safePage) setPage(targetPage);
    }
  }, [highlightId, isLoading, filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!highlightId || isLoading) return;
    document.getElementById(`order-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, isLoading, safePage]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center gap-2">
        <Receipt size={22} className="text-[#c2410c]" />
        <h1 className="text-2xl font-semibold text-neutral-900">Billing</h1>
      </div>

      {confirmedMessage && (
        <div role="status" className="mb-6 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {confirmedMessage}
        </div>
      )}

      {confirmOrder.isError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t confirm the order: {(confirmOrder.error as Error).message}. Try again.
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading orders…</p>}

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {missingPrice.length > 0 && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                {missingPrice.length} {missingPrice.length === 1 ? "order has" : "orders have"} no priced items yet,
                so {missingPrice.length === 1 ? "it isn't" : "they aren't"} included in the totals below.
              </span>
            </div>
          )}

          {/* Summary */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Total order value</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">
                <MoneyTotals totals={totals.total} />
              </div>
              {cancelledCount > 0 && (
                <div className="mt-1 text-xs text-neutral-400">
                  Excludes {cancelledCount} cancelled {cancelledCount === 1 ? "order" : "orders"}
                </div>
              )}
              {hasMultipleCurrencies && (
                <div className="mt-1 text-xs text-neutral-400">Shown per currency, not converted</div>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Outstanding</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">
                <MoneyTotals totals={totals.outstanding} />
              </div>
              <div className="mt-1 text-xs text-neutral-400">Pending, confirmed and shipped</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Delivered</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">
                <MoneyTotals totals={totals.delivered} />
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c2410c] ${
                  filter === s ? "bg-[#c2410c] text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {s}
                <span className={`ml-1.5 text-xs ${filter === s ? "text-white/80" : "text-neutral-400"}`}>
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Orders table */}
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Requester</th>
                  <th className="px-5 py-3">Item(s)</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((o) => {
                  const total = lineTotal(o);
                  const cancelled = o.status === "cancelled";
                  const isNew = highlightId !== null && String(o.id) === highlightId;
                  const confirmingThis = confirmOrder.isPending && confirmOrder.variables === o.id;

                  return (
                    <tr
                      key={o.id}
                      id={`order-${o.id}`}
                      className={`border-t border-neutral-100 ${isNew ? "bg-orange-50" : ""} ${cancelled ? "text-neutral-400" : ""}`}
                    >
                      <td className="px-5 py-3 font-medium text-neutral-900">{o.requesterName}</td>
                      <td className="px-5 py-3 text-neutral-700">{itemsSummary(o)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{totalQuantity(o)}</td>
                      <td
                        className={`px-5 py-3 text-right font-medium tabular-nums text-neutral-900 ${
                          cancelled ? "line-through" : ""
                        }`}
                      >
                        {total !== null ? (
                          formatMinor(total, currencyOf(o))
                        ) : (
                          <span className="text-amber-600">No price</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-neutral-500">
                        {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            STATUS_STYLES[o.status] ?? ""
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDetailOrder(o)}
                            className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
                          >
                            View details
                          </button>
                          {o.status === "pending" && (
                            <button
                              onClick={() => confirmOrder.mutate(o.id)}
                              disabled={confirmOrder.isPending || total === null}
                              title={total === null ? "Add a unit price before confirming" : undefined}
                              className="rounded-md bg-[#c2410c] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#9a3412] disabled:opacity-50"
                            >
                              {confirmingThis ? "Confirming…" : "Confirm order"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-400">
                      {filter === "all"
                        ? "No orders yet. Submit a request to get supplier options."
                        : `No ${filter} orders.`}
                    </td>
                  </tr>
                )}
              </tbody>

              {filtered.length > 0 && filter !== "cancelled" && (
                <tfoot>
                  <tr className="border-t border-neutral-200 bg-neutral-50">
                    <td colSpan={3} className="px-5 py-3 text-sm text-neutral-500">
                      {filter === "all" ? "Total" : `Total for ${filter} orders`}
                      {filteredSubtotal.size > 1 && (
                        <span className="ml-1 text-xs text-neutral-400">(per currency)</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-neutral-900">
                      <MoneyTotals totals={filteredSubtotal} />
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
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
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>

                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  // Keep the pager compact on large datasets: always show
                  // the first, last, current, and immediate neighbors; use
                  // an ellipsis for everything else.
                  .filter(
                    (n) =>
                      n === 1 || n === pageCount || (n >= safePage - 1 && n <= safePage + 1)
                  )
                  .reduce<(number | "ellipsis")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((entry, idx) =>
                    entry === "ellipsis" ? (
                      <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-neutral-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => setPage(entry)}
                        aria-current={entry === safePage ? "page" : undefined}
                        className={`min-w-[28px] rounded-md px-2 py-1.5 text-xs font-medium transition ${
                          entry === safePage
                            ? "bg-[#c2410c] text-white"
                            : "text-neutral-600 hover:bg-neutral-100"
                        }`}
                      >
                        {entry}
                      </button>
                    )
                  )}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage === pageCount}
                  className="flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}