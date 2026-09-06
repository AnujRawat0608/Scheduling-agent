"use client";

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";

type BillingStatus = "paid" | "pending" | "overdue";

type BillingRecord = {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  rate: number; // per-unit rate in INR
  date: string;
  status: BillingStatus;
};

const STATUS_STYLES: Record<BillingStatus, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-blue-100 text-blue-700",
  overdue: "bg-red-100 text-red-700",
};

const mockBilling: BillingRecord[] = [
  {
    id: "1",
    customer: "Acme Hardware Co.",
    product: "Raspberry Pi 5",
    quantity: 50,
    rate: 4200,
    date: "Sep 6, 2026",
    status: "pending",
  },
  {
    id: "2",
    customer: "NovaTech Labs",
    product: "STM32G071KBT6",
    quantity: 5000,
    rate: 68,
    date: "Sep 2, 2026",
    status: "paid",
  },
  {
    id: "3",
    customer: "Acme Hardware Co.",
    product: "M4 Stainless Bolts",
    quantity: 200,
    rate: 35,
    date: "Aug 30, 2026",
    status: "overdue",
  },
  {
    id: "4",
    customer: "Brightline Robotics",
    product: "Raspberry Pi 5",
    quantity: 20,
    rate: 4200,
    date: "Aug 24, 2026",
    status: "paid",
  },
];

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function BillingPage() {
  const [filter, setFilter] = useState<"all" | BillingStatus>("all");

  const filtered = useMemo(
    () => (filter === "all" ? mockBilling : mockBilling.filter((b) => b.status === filter)),
    [filter]
  );

  const totals = useMemo(() => {
    const withTotal = mockBilling.map((b) => b.quantity * b.rate);
    const total = withTotal.reduce((sum, v) => sum + v, 0);
    const outstanding = mockBilling
      .filter((b) => b.status !== "paid")
      .reduce((sum, b) => sum + b.quantity * b.rate, 0);
    const paid = mockBilling
      .filter((b) => b.status === "paid")
      .reduce((sum, b) => sum + b.quantity * b.rate, 0);
    return { total, outstanding, paid };
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Receipt size={22} className="text-[#3d6bff]" />
          <h1 className="text-2xl font-semibold text-neutral-900">Billing</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-xs text-neutral-400 mb-1">Total billed</div>
          <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.total)}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-xs text-neutral-400 mb-1">Outstanding</div>
          <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.outstanding)}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="text-xs text-neutral-400 mb-1">Paid</div>
          <div className="text-xl font-semibold text-neutral-900">{formatINR(totals.paid)}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-1 w-fit">
        {(["all", "pending", "paid", "overdue"] as const).map((s) => (
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

      {/* Billing table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3">Qty</th>
              <th className="px-5 py-3">Rate</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-t border-neutral-100">
                <td className="px-5 py-3 font-medium text-neutral-900">{b.customer}</td>
                <td className="px-5 py-3 text-neutral-700">{b.product}</td>
                <td className="px-5 py-3 text-neutral-700">{b.quantity}</td>
                <td className="px-5 py-3 text-neutral-700">{formatINR(b.rate)}</td>
                <td className="px-5 py-3 font-medium text-neutral-900">
                  {formatINR(b.quantity * b.rate)}
                </td>
                <td className="px-5 py-3 text-neutral-500">{b.date}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[b.status]}`}
                  >
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-neutral-400">
                  No billing records here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-neutral-400">
        Mock data for now — connect this to your actual orders/invoices backend when it's ready.
      </p>
    </div>
  );
}