"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox } from "lucide-react";
import { fetchCurrentSupplier } from "../../../lib/supplierAuthApi";
import { fetchMySupplierOrders, startShipping, type SupplierOrder } from "../../../lib/supplierOrdersApi";
import { formatMoney } from "../../../lib/format";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-emerald-50 text-emerald-700",
};

const FILTERS = ["all", "confirmed", "shipped", "delivered"] as const;
type Filter = (typeof FILTERS)[number];

const PAGE_STEP = 10;

/** Money fields arrive as numbers (or null for orders without prices). */
function money(value: number | null, currency: string) {
  return value === null ? "—" : formatMoney(Number(value), currency);
}

/**
 * Orders buyers have placed with the logged-in supplier AND confirmed on their side.
 * Read-only: the buyer confirms an order, the supplier fulfils it. Pending orders
 * (not yet confirmed by the buyer) and cancelled ones are not listed, only counted.
 */
export default function SupplierOrdersPage() {
  const router = useRouter();

  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  // Orders shipped in this session: their button is hidden at once, before the list reloads.
  const [shippedIds, setShippedIds] = useState<Set<string>>(new Set());

  // Start shipping: the server marks the order shipped and emails the buyer.
  const ship = useMutation({
    mutationFn: startShipping,
    onSuccess: (result, orderId) => {
      setShippedIds((prev) => new Set(prev).add(orderId));
      setNotice(
        result.notified
          ? { kind: "ok", text: `Order marked as shipped. ${result.order.requesterName} has been emailed.` }
          : { kind: "warn", text: "Order marked as shipped, but the buyer could not be emailed." }
      );
      queryClient.invalidateQueries({ queryKey: ["supplier-orders-mine"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] }); // buyer's billing view
    },
  });

  function handleStartShipping(o: SupplierOrder) {
    if (ship.isPending) return;
    const ok = window.confirm(
      `Mark the order for ${o.requesterName} as shipped? ${o.requesterEmail} will be notified, and this can't be undone.`
    );
    if (!ok) return;
    setNotice(null);
    ship.mutate(o.id);
  }

  // Only suppliers can see this page.
  useEffect(() => {
    fetchCurrentSupplier()
      .then((s) => {
        if (s) setSupplierName(s.businessName);
        else router.replace("/suppliers/login");
      })
      .catch(() => router.replace("/suppliers/login"))
      .finally(() => setAuthChecked(true));
  }, [router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-orders-mine"],
    queryFn: fetchMySupplierOrders,
    enabled: !!supplierName,
    refetchInterval: 30_000, // pick up newly confirmed orders without a manual reload
  });

  const all = data?.orders ?? [];
  const waitingForBuyer = all.filter((o) => o.status === "pending").length;

  // Confirmed or later, newest first.
  const fulfilable = useMemo(
    () =>
      all
        .filter((o) => o.status !== "pending" && o.status !== "cancelled")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [all]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: fulfilable.length };
    for (const o of fulfilable) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [fulfilable]);

  const filtered = filter === "all" ? fulfilable : fulfilable.filter((o) => o.status === filter);
  const shown = filtered.slice(0, visibleCount);

  function changeFilter(next: Filter) {
    setFilter(next);
    setVisibleCount(PAGE_STEP);
  }

  if (!authChecked || !supplierName) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6" />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link
          href="/suppliers/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={12} />
          Back to dashboard
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
              <Inbox size={18} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
              <p className="text-sm text-slate-500">Orders buyers have confirmed with {supplierName}</p>
            </div>
          </div>
          {waitingForBuyer > 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {waitingForBuyer} waiting for the buyer to confirm
            </span>
          )}
        </div>

        {/* Status filter */}
        <div className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => changeFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                filter === f ? "bg-[#3d6bff] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f}
              <span className={`ml-1.5 text-xs ${filter === f ? "text-white/80" : "text-slate-400"}`}>
                {counts[f] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {notice && (
          <div
            role="status"
            className={`rounded-lg border p-3 text-sm ${
              notice.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {notice.text}
          </div>
        )}

        {ship.isError && !notice && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Couldn&apos;t start shipping: {(ship.error as Error).message}
          </div>
        )}

        {isLoading && <p className="text-sm text-slate-500">Loading orders…</p>}

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Inbox size={18} />
            </span>
            <p className="text-sm font-medium text-slate-700">
              {filter === "all" ? "No confirmed orders yet" : `No ${filter} orders`}
            </p>
            <p className="max-w-xs text-xs text-slate-500">
              When a buyer orders from your profile page and confirms it, it will show up here.
            </p>
          </div>
        )}

        {shown.length > 0 && (
          <ul className="space-y-3">
            {shown.map((o: SupplierOrder) => {
              const tax = Number(o.taxAmount ?? 0);
              return (
                <li key={o.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{o.requesterName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                            STATUS_STYLES[o.status] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {o.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {o.requesterEmail} ·{" "}
                        {new Date(o.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold tabular-nums text-slate-900">
                        {money(o.total, o.currency)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Subtotal {money(o.subtotal, o.currency)}
                        {tax > 0 && ` · Tax ${money(tax, o.currency)}`}
                        {` · Shipping ${Number(o.shippingCost ?? 0) > 0 ? money(o.shippingCost, o.currency) : "free"}`}
                      </div>
                      {o.status === "confirmed" && !shippedIds.has(o.id) && (
                        <button
                          type="button"
                          onClick={() => handleStartShipping(o)}
                          disabled={ship.isPending}
                          className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {ship.isPending && ship.variables === o.id ? "Starting…" : "Start shipping"}
                        </button>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3 space-y-0.5 border-t border-slate-100 pt-3 text-sm text-slate-700">
                    {o.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span>
                          {item.quantity} × {item.itemName}
                        </span>
                        {item.unitPrice != null && (
                          <span className="text-xs tabular-nums text-slate-400">
                            {money(Number(item.unitPrice), o.currency)} each
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 space-y-0.5 text-xs text-slate-500">
                    <p>
                      <span className="text-slate-400">Deliver to:</span> {o.deliveryAddress}
                    </p>
                    {o.notes && (
                      <p>
                        <span className="text-slate-400">Notes:</span> {o.notes}
                      </p>
                    )}
                    <p className="text-slate-400">Order ID {o.id}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > shown.length && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {shown.length} of {filtered.length}
            </span>
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_STEP)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
            >
              Show more
            </button>
          </div>
        )}
      </div>
    </main>
  );
}