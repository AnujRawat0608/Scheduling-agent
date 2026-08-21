"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listRuns } from "../../lib/api";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  gathering: "bg-neutral-100 text-neutral-600",
  proposing: "bg-neutral-100 text-neutral-600",
  awaiting_approval: "bg-blue-100 text-blue-700",
  sending: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function RunsListPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["runs"],
    queryFn: listRuns,
    refetchInterval: 5000,
  });

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-lg font-medium text-neutral-900">History</h1>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load runs: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && data.length === 0 && (
        <p className="text-sm text-neutral-500">
          No runs yet. Create one to get started.
        </p>
      )}

      <div className="space-y-2">
        {data?.map((run) => (
          <Link
            key={run.id}
            href={`/runs/${run.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 transition hover:border-neutral-400"
          >
            <div>
              <div className="font-medium text-neutral-900">{run.title}</div>
              <div className="text-xs text-neutral-500">
                {format(new Date(run.createdAt), "MMM d, h:mm a")}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[run.status] ?? ""}`}
            >
              {run.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
