"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RiskAssessmentBadge } from "../../../components/RiskAssessmentBadge";
import {
  fetchProcurementTask,
  type QuoteScore,
  type FulfillmentPlan,
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["procurement", params.id],
    queryFn: () => fetchProcurementTask(params.id),
    refetchInterval: (query) => {
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" ? false : 2000;
    },
  });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <Link
        href="/procurement"
        className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft size={12} />
        Back to requests
      </Link>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div>
          <h1 className="text-lg font-medium text-neutral-900">{task.itemsSummary}</h1>
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

        {state.riskCheckStatus && state.riskAssessment && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(state.riskAssessment).map(([region, assessment]) => (
              <RiskAssessmentBadge
                key={region}
                riskCheckStatus={state.riskCheckStatus}
                riskAssessment={assessment}
              />
            ))}
          </div>
        )}
        {state.riskCheckStatus && !state.riskAssessment && (
          <RiskAssessmentBadge riskCheckStatus={state.riskCheckStatus} riskAssessment={null} />
        )}

        {/* Consolidated view — the recommended plan, plus other viable combinations */}
        {state.recommendedPlan && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Recommended plan
            </h2>
            <PlanCard plan={state.recommendedPlan} highlight />

            {state.alternativePlans && state.alternativePlans.length > 0 && (
              <details className="rounded-lg border border-neutral-200">
                <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700">
                  {state.alternativePlans.length} other viable combination
                  {state.alternativePlans.length === 1 ? "" : "s"}
                </summary>
                <div className="space-y-2 border-t border-neutral-100 p-3">
                  {state.alternativePlans.map((plan, i) => (
                    <PlanCard key={i} plan={plan} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Per-item view — each line item's top matching suppliers */}
        {state.lineItemQuotes && state.lineItemQuotes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Per-item options
            </h2>
            {state.lineItemQuotes.map((liq, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium text-neutral-800">
                  {liq.lineItem.item}{" "}
                  <span className="font-normal text-neutral-400">× {liq.lineItem.quantity}</span>
                </p>
                {!liq.hasMatch ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No supplier found for this item.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <tr>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2">Unit price</th>
                          <th className="px-4 py-2">Lead time</th>
                          <th className="px-4 py-2">Total cost</th>
                          <th className="px-4 py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liq.topQuotes.map((q: QuoteScore) => (
                          <tr key={q.supplierName} className="border-t border-neutral-100">
                            <td className="px-4 py-2 font-medium text-neutral-900">
                              {q.supplierId ? (
                                
                                  <a href={`/suppliers/${q.supplierId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#3d6bff] hover:underline"
                                >
                                  {q.supplierName}
                                </a>
                              ) : (
                                q.supplierName
                              )}
                            </td>
                            <td className="px-4 py-2">₹{q.unitPrice.toLocaleString("en-IN")}</td>
                            <td className="px-4 py-2">{q.leadTimeDays}d</td>
                            <td className="px-4 py-2">₹{q.totalCost.toLocaleString("en-IN")}</td>
                            <td className="px-4 py-2 text-xs text-neutral-500">{q.rationale}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {state.status === "done" && state.purchaseConfirmations && state.purchaseConfirmations.length > 0 && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Purchase confirmed with{" "}
            {state.purchaseConfirmations.map((c) => c.supplierName).join(", ")}.
          </div>
        )}

        {state.status === "failed" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {state.failureReason ?? "This request couldn't be completed."}
          </div>
        )}
      </div>
    </main>
  );
}

function PlanCard({ plan, highlight }: { plan: FulfillmentPlan; highlight?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-green-200 bg-green-50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-900">
          {plan.legs.length === 1 ? "Single supplier" : `Split across ${plan.legs.length} suppliers`}
        </span>
        <span className="text-sm font-semibold text-neutral-900">
          ₹{plan.totalCost.toLocaleString("en-IN")}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{plan.rationale}</p>
      <div className="mt-2 space-y-1">
        {plan.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between text-xs text-neutral-600">
            <span>
              {leg.supplierName} — {leg.lineItems.map((li) => li.item).join(", ")}
            </span>
            <span>₹{leg.legCost.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
      {plan.unmatchedItems.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          No supplier found for: {plan.unmatchedItems.map((li) => li.item).join(", ")}
        </p>
      )}
    </div>
  );
}