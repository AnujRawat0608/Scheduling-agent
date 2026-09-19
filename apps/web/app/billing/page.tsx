"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { fetchAllSupplierOrders, confirmSupplierOrder, type SupplierOrder } from "../../lib/supplierOrdersApi";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function BillingPage() {
  const [filter, setFilter] = useState<"all" | string>("all");
  const [confirmedMessage, setConfirmedMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-orders"],
    queryFn: fetchAllSupplierOrders,
  });

  const confirmOrder = useMutation({
    mutationFn: confirmSupplierOrder,
    onSuccess: () => {
      setConfirmedMessage("Order placed successfully!");
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
      setTimeout(() => setConfirmedMessage(null), 3000);
    },
  });

  const orders = data?.orders ?? [];

  const filtered = useMemo(
    () => (filter === "all" ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  const totals = useMemo(() => {
    const orderTotal = (o: SupplierOrder) => (o.unitPrice ?? 0) * o.quantity;
    const total = orders.reduce((sum, o) => sum + orderTotal(o), 0);
    const outstanding = orders
      .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
      .reduce((sum, o) => sum + orderTotal(o), 0);
    const delivered = orders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + orderTotal(o), 0);
    return { total, outstanding, delivered };
  }, [orders]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Receipt size={22} className="text-[#3d6bff]" />
          <h1 className="text-2xl font-semibold text-neutral-900">Billing</h1>
        </div>
      </div>

      {confirmedMessage && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {confirmedMessage}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading orders…</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="text-xs text-neutral-400 mb-1">Total order value</div>
              <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.total)}</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="text-xs text-neutral-400 mb-1">Outstanding</div>
              <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.outstanding)}</div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="text-xs text-neutral-400 mb-1">Delivered</div>
              <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.delivered)}</div>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-1 w-fit">
            {(["all", "pending", "confirmed", "shipped", "delivered", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                  filter === s
                    ? "bg-[#3d6bff] text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Orders table */}
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Requester</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Qty</th>
                  <th className="px-5 py-3">Unit price</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-neutral-100">
                    <td className="px-5 py-3 font-medium text-neutral-900">{o.requesterName}</td>
                    <td className="px-5 py-3 text-neutral-700">{o.itemName}</td>
                    <td className="px-5 py-3 text-neutral-700">{o.quantity}</td>
                    <td className="px-5 py-3 text-neutral-700">
                      {o.unitPrice != null ? formatINR(o.unitPrice) : "—"}
                    </td>
                    <td className="px-5 py-3 font-medium text-neutral-900">
                      {o.unitPrice != null ? formatINR(o.unitPrice * o.quantity) : "—"}
                    </td>
                    <td className="px-5 py-3 text-neutral-500">
                      {new Date(o.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[o.status] ?? ""}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {o.status === "pending" && (
                        <button
                          onClick={() => confirmOrder.mutate(o.id)}
                          disabled={confirmOrder.isPending}
                          className="rounded-md bg-[#3d6bff] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
                        >
                          Confirm order
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-neutral-400">
                      No orders here yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}