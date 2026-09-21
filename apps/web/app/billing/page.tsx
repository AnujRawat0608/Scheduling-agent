"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, TriangleAlert } from "lucide-react";
import { fetchAllSupplierOrders, confirmSupplierOrder, type SupplierOrder } from "../../lib/supplierOrdersApi";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const FILTERS = ["all", "pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

/* ---------- Money helpers ----------
 * All maths is done in paise (integers) so sums never drift (0.1 + 0.2 problem),
 * and API values that arrive as strings ("250.00") or with symbols are handled.
 */
function toPaise(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Line total in paise, or null when the price/quantity is missing. */
function lineTotal(o: SupplierOrder): number | null {
  const unit = toPaise(o.unitPrice);
  const qty = Number(o.quantity);
  if (unit === null || !Number.isFinite(qty)) return null;
  return unit * qty;
}

function formatINR(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

const sumPaise = (orders: SupplierOrder[]) => orders.reduce((sum, o) => sum + (lineTotal(o) ?? 0), 0);

function BillingContent() {
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // Redirect to /billing?highlight=<orderId> after "add product" to spotlight the new row.
  const highlightId = searchParams.get("highlight");

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-orders"],
    queryFn: fetchAllSupplierOrders,
    // Always refetch when landing here so a just-added product is never missing from the totals.
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

  // Cancelled orders are never billed, so they are excluded from every total.
  const billable = useMemo(() => orders.filter((o) => o.status !== "cancelled"), [orders]);
  const cancelledCount = orders.length - billable.length;
  const missingPrice = useMemo(() => billable.filter((o) => lineTotal(o) === null), [billable]);

  const totals = useMemo(() => {
    const open = billable.filter((o) => o.status !== "delivered");
    const delivered = billable.filter((o) => o.status === "delivered");
    return {
      total: sumPaise(billable),
      outstanding: sumPaise(open),
      delivered: sumPaise(delivered),
    };
  }, [billable]);

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
    () => sumPaise(filtered.filter((o) => o.status !== "cancelled")),
    [filtered]
  );

  // Scroll the newly added order into view.
  useEffect(() => {
    if (!highlightId || isLoading) return;
    document.getElementById(`order-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, isLoading, orders.length]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center gap-2">
        <Receipt size={22} className="text-[#3d6bff]" />
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
                {missingPrice.length} {missingPrice.length === 1 ? "order has" : "orders have"} no unit price yet,
                so {missingPrice.length === 1 ? "it isn't" : "they aren't"} included in the totals below.
              </span>
            </div>
          )}

          {/* Summary */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Total order value</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">{formatINR(totals.total)}</div>
              {cancelledCount > 0 && (
                <div className="mt-1 text-xs text-neutral-400">
                  Excludes {cancelledCount} cancelled {cancelledCount === 1 ? "order" : "orders"}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Outstanding</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">{formatINR(totals.outstanding)}</div>
              <div className="mt-1 text-xs text-neutral-400">Pending, confirmed and shipped</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-xs text-neutral-500">Delivered</div>
              <div className="text-xl font-semibold tabular-nums text-neutral-900">{formatINR(totals.delivered)}</div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d6bff] ${
                  filter === s ? "bg-[#3d6bff] text-white" : "text-neutral-600 hover:bg-neutral-100"
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
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Unit price</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const total = lineTotal(o);
                  const unit = toPaise(o.unitPrice);
                  const cancelled = o.status === "cancelled";
                  const isNew = highlightId !== null && String(o.id) === highlightId;
                  const confirmingThis = confirmOrder.isPending && confirmOrder.variables === o.id;

                  return (
                    <tr
                      key={o.id}
                      id={`order-${o.id}`}
                      className={`border-t border-neutral-100 ${isNew ? "bg-blue-50" : ""} ${cancelled ? "text-neutral-400" : ""}`}
                    >
                      <td className="px-5 py-3 font-medium text-neutral-900">{o.requesterName}</td>
                      <td className="px-5 py-3 text-neutral-700">{o.itemName}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-neutral-700">{o.quantity}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-neutral-700">
                        {unit !== null ? formatINR(unit) : <span className="text-amber-600">No price</span>}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-medium tabular-nums text-neutral-900 ${
                          cancelled ? "line-through" : ""
                        }`}
                      >
                        {total !== null ? formatINR(total) : "—"}
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
                        {o.status === "pending" && (
                          <button
                            onClick={() => confirmOrder.mutate(o.id)}
                            disabled={confirmOrder.isPending || total === null}
                            title={total === null ? "Add a unit price before confirming" : undefined}
                            className="rounded-md bg-[#3d6bff] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
                          >
                            {confirmingThis ? "Confirming…" : "Confirm order"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-neutral-400">
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
                    <td colSpan={4} className="px-5 py-3 text-sm text-neutral-500">
                      {filter === "all" ? "Total" : `Total for ${filter} orders`}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-neutral-900">
                      {formatINR(filteredSubtotal)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  // useSearchParams needs a Suspense boundary in the Next.js app router.
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}