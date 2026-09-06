"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchProcurementTask,
  approveProcurementTask,
  rejectProcurementTask,
  type QuoteScore,
} from "../../../lib/procurementApi";

const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  awaiting_approval: "bg-blue-100 text-blue-700",
  purchasing: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function ProcurementDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["procurement", params.id],
    queryFn: () => fetchProcurementTask(params.id),
    refetchInterval: (query) => {
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" ? false : 2000;
    },
  });

  const approve = useMutation({
    mutationFn: (supplierName?: string) => approveProcurementTask(params.id, supplierName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", params.id] }),
  });

  const reject = useMutation({
    mutationFn: (note?: string) => rejectProcurementTask(params.id, note ?? "Rejected by approver"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["procurement", params.id] }),
  });

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load task: {(error as Error).message}
        </div>
      </main>
    );
  }

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  }

  const { task, state } = data;
  const isAwaitingApproval = state.status === "awaiting_approval";
  const activeSelection = selectedSupplier ?? state.recommendedSupplier?.supplierName ?? null;

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <div>
        <h1 className="text-lg font-medium text-neutral-900">
          {state.request?.quantity}x {task.item}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[state.status] ?? ""}`}
          >
            {state.status.replace("_", " ")}
          </span>
          {state.request?.requiredBy && (
            <span className="text-xs text-neutral-500">
              needed by {new Date(state.request.requiredBy).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {state.rfqEmail && (
        <details className="rounded-lg border border-neutral-200 p-4">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700">
            RFQ sent to suppliers
          </summary>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-neutral-600">{state.rfqEmail}</pre>
        </details>
      )}

      {state.scoredQuotes.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">Supplier quotes</h2>
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  {isAwaitingApproval && <th className="px-4 py-2"></th>}
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2">Unit price</th>
                  <th className="px-4 py-2">Lead time</th>
                  <th className="px-4 py-2">Total cost</th>
                  <th className="px-4 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {state.scoredQuotes.map((q: QuoteScore) => {
                  const isRecommended = state.recommendedSupplier?.supplierName === q.supplierName;
                  const isSelected = activeSelection === q.supplierName;
                  return (
                    <tr
                      key={q.supplierName}
                      onClick={() => isAwaitingApproval && setSelectedSupplier(q.supplierName)}
                      className={`border-t border-neutral-100 ${isAwaitingApproval ? "cursor-pointer" : ""} ${
                        isSelected ? "bg-blue-50" : isRecommended ? "bg-green-50" : ""
                      }`}
                    >
                      {isAwaitingApproval && (
                        <td className="px-4 py-2">
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => setSelectedSupplier(q.supplierName)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-2 font-medium text-neutral-900">
                        {q.supplierName}
                        {isRecommended && (
                          <span className="ml-2 text-xs font-normal text-green-700">recommended</span>
                        )}
                      </td>
                      <td className="px-4 py-2">₹{q.unitPrice.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2">{q.leadTimeDays}d</td>
                      <td className="px-4 py-2">₹{q.totalCost.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{q.rationale}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAwaitingApproval && state.recommendedSupplier && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm text-blue-900">
            Select a supplier above (recommendation is pre-selected), then confirm.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => activeSelection && approve.mutate(activeSelection)}
              disabled={approve.isPending || reject.isPending || !activeSelection}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {approve.isPending
                ? "Confirming…"
                : `Approve purchase from ${activeSelection ?? "…"}`}
            </button>
            <button
              onClick={() => reject.mutate(undefined)}
              disabled={approve.isPending || reject.isPending}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 disabled:opacity-50"
            >
              Reject entirely
            </button>
          </div>
        </div>
      )}

      {state.status === "done" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Purchase confirmed with {state.recommendedSupplier?.supplierName}.
        </div>
      )}

      {state.status === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {state.failureReason ?? "This request couldn't be completed."}
        </div>
      )}
    </main>
  );
}