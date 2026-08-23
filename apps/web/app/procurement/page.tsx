"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listProcurementTasks } from "../../lib/procurementApi";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  awaiting_approval: "bg-blue-100 text-blue-700",
  purchasing: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function ProcurementListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["procurement-tasks"],
    queryFn: listProcurementTasks,
    refetchInterval: 5000,
  });

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-neutral-900">Procurement</h1>
        <Link
          href="/procurement/new"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          New request
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && data.length === 0 && (
        <p className="text-sm text-neutral-500">No procurement requests yet.</p>
      )}

      <div className="space-y-2">
        {data?.map((task) => (
          <Link
            key={task.id}
            href={`/procurement/${task.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-400"
          >
            <div>
              <div className="font-medium text-neutral-900">
                {task.quantity}x {task.item}
              </div>
              <div className="text-xs text-neutral-500">
                {format(new Date(task.createdAt), "MMM d, h:mm a")}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[task.status] ?? ""}`}
            >
              {task.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}