"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { fetchMySupplierOrders, type SupplierOrder } from "../lib/supplierOrdersApi";
import { formatMoney } from "../lib/format";

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-indigo-50 text-indigo-700",
  shipped: "bg-purple-50 text-purple-700",
  delivered: "bg-emerald-50 text-emerald-700",
};

const MAX_SHOWN = 10;

/**
 * Orders buyers have placed with the logged-in supplier AND confirmed on their side.
 * Read-only: the buyer confirms an order, the supplier fulfils it. Pending orders
 * (not yet confirmed by the buyer) and cancelled ones are not listed, only counted.
 */
export function IncomingOrders() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-orders-mine"],
    queryFn: fetchMySupplierOrders,
    refetchInterval: 30_000, // pick up newly confirmed orders without a manual reload
  });

  const all = data?.orders ?? [];
  const waitingForBuyer = all.filter((o) => o.status === "pending").length;

  // Newest first.
  const orders = all
    .filter((o) => o.status !== "pending" && o.status !== "cancelled")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const shown = orders.slice(0, MAX_SHOWN);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
            <Inbox size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Confirmed orders</h2>
            <p className="text-xs text-slate-500">Orders buyers have confirmed with you</p>
          </div>
        </div>
        {waitingForBuyer > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {waitingForBuyer} waiting for the buyer to confirm
          </span>
        )}
      </header>

      <div>
        {isLoading && <p className="px-6 py-6 text-sm text-slate-500">Loading orders…</p>}

        {error && (
          <p role="alert" className="px-6 py-6 text-sm text-red-600">
            {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Inbox size={18} />
            </span>
            <p className="text-sm font-medium text-slate-700">No confirmed orders yet</p>
            <p className="max-w-xs text-xs text-slate-500">
              When a buyer orders from your profile page and confirms it, it will show up here.
            </p>
          </div>
        )}

        {shown.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {shown.map((o: SupplierOrder) => (
              <li key={o.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{o.requesterName}</span>
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
                      {new Date(o.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {o.total !== null ? formatMoney(Number(o.total), o.currency) : "—"}
                  </span>
                </div>

                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {o.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.itemName}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">Deliver to: {o.deliveryAddress}</p>
                {o.notes && <p className="mt-0.5 text-xs text-slate-400">Notes: {o.notes}</p>}
              </li>
            ))}
          </ul>
        )}

        {orders.length > MAX_SHOWN && (
          <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
            Showing the latest {MAX_SHOWN} of {orders.length} confirmed orders.
          </p>
        )}
      </div>
    </section>
  );
}