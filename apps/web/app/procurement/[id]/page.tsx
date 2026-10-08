"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { RiskAssessmentBadge } from "../../../components/RiskAssessmentBadge";
import { SupplierBadge } from "../../../components/SupplierBadge";
import { findApprovalTarget, buildRfqMailHref } from "../../../lib/procurementSourcing";
import { formatMoney } from "../../../lib/format";
import { DISPLAY_CURRENCIES } from "../../../lib/fxApi";
import { useMoneyDisplay } from "../../../lib/useMoneyDisplay";
import {
  fetchProcurementTask,
  approveProcurementTask,
  type QuoteScore,
  type FulfillmentPlan,
} from "../../../lib/procurementApi";

// The backend ranks and sums everything in this currency. The dropdown below only
// changes how amounts are DISPLAYED.
const BUYER_CURRENCY = "INR";

const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  needs_info: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-blue-100 text-blue-700",
  purchasing: "bg-blue-100 text-blue-700",
  rfq_sent: "bg-green-100 text-green-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

/** Mail link for a supplier found on the web (not registered). Same as in new/page.tsx.
 *  Falls back to their page when no email is known. */
function webRfqHref(item: { item: string; quantity: number }, q: QuoteScore): string {
  if (!q.contactEmail) return q.sourceUrl ?? "#";
  const subject = encodeURIComponent(`Request for quotation: ${item.item} x ${item.quantity}`);
  const body = encodeURIComponent(
    `Hello ${q.supplierName},\n\nWe would like a quotation for ${item.quantity} x ${item.item}. ` +
      `Please confirm the unit price, stock, lead time, shipping and applicable taxes.\n\nThank you`
  );
  return `mailto:${q.contactEmail}?subject=${subject}&body=${body}`;
}

export default function ProcurementDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();

  // Plan approved in this session (0 = recommended, n = alternativePlans[n - 1]).
  // After a reload this is null and rows fall back to matching the RFQ results by supplier.
  const [approvedPlan, setApprovedPlan] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["procurement", params.id],
    queryFn: () => fetchProcurementTask(params.id),
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" || status === "rfq_sent" ? false : 2000;
    },
  });

  // ⚠️ VERIFY: assumes selectedPlanIndex 1 → alternativePlans[0], 2 → alternativePlans[1], etc.
  // Confirm this matches your backend's /approve handler before relying on it for a real purchase.
  const approve = useMutation({
    mutationFn: ({ plan }: { plan?: number; source: string }) =>
      approveProcurementTask(params.id, plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["procurement", params.id] }),
  });

  // Which exact button was clicked? e.g. "recommended", "alt-0", "row-0-2".
  // Each button compares against its own key, so only the clicked one shows "Approving…".
  const approvingSource: string | null = approve.isPending
    ? (approve.variables?.source ?? null)
    : null;

  function startApprove(plan: number | undefined, source: string) {
    if (approve.isPending) return;
    // Remember the choice right away: the backend flips the status to "purchasing"
    // while the request is still running.
    const previous = approvedPlan;
    setApprovedPlan(plan ?? 0);
    approve.mutate({ plan, source }, { onError: () => setApprovedPlan(previous) });
  }

  // Hooks must run before any early return below.
  const md = useMoneyDisplay(BUYER_CURRENCY);

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
  const canApprove = state.status === "awaiting_approval";
  // Once approved, the task leaves "awaiting_approval" and per-row actions are no longer valid.
  const isLocked = ["purchasing", "rfq_sent", "done"].includes(state.status);
  const isProcessing = ["extracting", "sourcing", "comparing"].includes(state.status);

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium text-neutral-900">{task.itemsSummary}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[state.status] ?? "bg-neutral-100 text-neutral-600"}`}
              >
                {state.status.replace(/_/g, " ")}
              </span>
              {state.request?.requiredBy && (
                <span className="text-xs text-neutral-500">
                  needed by {new Date(state.request.requiredBy).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Display currency: changes how amounts are shown, not how suppliers are ranked */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              Show totals in
              <select
                value={md.displayCurrency}
                onChange={(e) => md.setDisplayCurrency(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-1.5 py-1 text-xs font-medium text-neutral-800 outline-none focus:border-[#3d6bff]"
              >
                {DISPLAY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {md.displayCurrency !== BUYER_CURRENCY && (
              <p className="max-w-[260px] text-right text-[11px] text-neutral-400">
                {md.fx
                  ? `Approximate, converted at rates from ${md.ratesAsOf}. Suppliers invoice in their own currency.`
                  : "Exchange rates unavailable right now, showing original currencies."}
              </p>
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
            <PlanCard plan={state.recommendedPlan} show={md.money} highlight />

            {canApprove && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => startApprove(undefined, "recommended")}
                  disabled={approvingSource === "recommended"}
                  className="rounded-md bg-[#3d6bff] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-40"
                >
                  {approvingSource === "recommended" ? "Approving…" : "Approve this plan"}
                </button>
                {approve.isError && (
                  <span className="text-xs text-red-600">{(approve.error as Error).message}</span>
                )}
              </div>
            )}

            {state.alternativePlans && state.alternativePlans.length > 0 && (
              <details className="rounded-lg border border-neutral-200">
                <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700">
                  {state.alternativePlans.length} other viable combination
                  {state.alternativePlans.length === 1 ? "" : "s"}
                </summary>
                <div className="space-y-2 border-t border-neutral-100 p-3">
                  {state.alternativePlans.map((plan, i) => (
                    <PlanCard
                      key={i}
                      plan={plan}
                      show={md.money}
                      onApprove={canApprove ? () => startApprove(i + 1, `alt-${i}`) : undefined}
                      approving={approvingSource === `alt-${i}`}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {state.status === "done" &&
          !state.recommendedPlan &&
          state.lineItemQuotes?.some((liq) =>
            liq.topQuotes.some((q) => q.source && q.source !== "registered")
          ) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              These results were found on the web and are unverified, so request a quote from the
              supplier directly.
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
                    {isProcessing
                      ? "Finding suppliers for your request."
                      : "No supplier found for this item."}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <tr>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2">Unit price</th>
                          <th className="px-4 py-2">Lead time</th>
                          <th className="px-4 py-2">Total cost</th>
                          <th className="px-4 py-2">Notes</th>
                          <th className="px-4 py-2">Compliance</th>
                          <th className="px-4 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liq.topQuotes.map((q: QuoteScore, j: number) => {
                          const approx = md.unitApprox(q);
                          const detail = md.quoteDetail(q);

                          const isWeb = !!q.source && q.source !== "registered";
                          const href = isWeb
                            ? q.sourceUrl
                            : q.supplierId
                              ? `/suppliers/${q.supplierId}`
                              : undefined;

                          // Reuses the real risk data already fetched for this task —
                          // matched by region, not a separate per-row risk system.
                          const rowRisk = q.supplierRegion
                            ? state.riskAssessment?.[q.supplierRegion]
                            : null;

                          const approvalTarget = findApprovalTarget(
                            liq.lineItem.item,
                            q,
                            state.recommendedPlan,
                            state.alternativePlans
                          );

                          // Plan number this row's button approves:
                          // 0 = recommended, n = alternativePlans[n - 1].
                          const planNumber =
                            approvalTarget && !isWeb
                              ? approvalTarget.kind === "recommended"
                                ? 0
                                : approvalTarget.index + 1
                              : null;

                          // Is this row the supplier that was actually approved?
                          const isApprovedRow =
                            approvedPlan !== null
                              ? planNumber === approvedPlan
                              : !!q.supplierId &&
                                !!state.rfqResults?.some((r) => r.supplierId === q.supplierId);

                          const rowSource = `row-${i}-${j}`;

                          return (
                            // One supplier can have several offers, so the supplier name alone is not a unique key.
                            <tr key={`${q.supplierId ?? q.supplierName}-${j}`} className="border-t border-neutral-100">
                              <td className="px-4 py-2 font-medium text-neutral-900">
                                {href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#3d6bff] hover:underline"
                                  >
                                    {q.supplierName}
                                  </a>
                                ) : (
                                  q.supplierName
                                )}
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {isWeb ? (
                                    <span
                                      title={`Found on the web. Extraction confidence ${Math.round((q.confidence ?? 0) * 100)}%. Prices are indicative until the supplier confirms.`}
                                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                    >
                                      Found on web · unverified
                                    </span>
                                  ) : (
                                    <SupplierBadge quote={q} />
                                  )}
                                  {rowRisk && (
                                    <span
                                      title={rowRisk.recommendation}
                                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        rowRisk.overall_status === "red"
                                          ? "bg-red-100 text-red-700"
                                          : rowRisk.overall_status === "yellow"
                                            ? "bg-yellow-100 text-yellow-700"
                                            : rowRisk.overall_status === "green"
                                              ? "bg-green-100 text-green-700"
                                              : "bg-neutral-100 text-neutral-500"
                                      }`}
                                    >
                                      {rowRisk.overall_status} route
                                    </span>
                                  )}
                                </div>
                              </td>
                              {/* Unit price: always the supplier's own price, plus an approximation */}
                              <td className="px-4 py-2">
                                <div>{formatMoney(q.unitPrice, q.currency)}</div>
                                {approx && <div className="text-xs text-neutral-400">≈ {approx}</div>}
                              </td>
                              <td className="px-4 py-2">
                                <div>{q.leadTimeDays}d</div>
                                {q.leadTimeAssumed && (
                                  <div className="text-[10px] text-amber-600">assumed</div>
                                )}
                              </td>
                              {/* Total, in the display currency */}
                              <td className="px-4 py-2">
                                <div className="font-medium">{md.quoteAmount(q, "total")}</div>
                                {detail && <div className="text-xs text-neutral-400">{detail}</div>}
                              </td>
                              <td className="px-4 py-2 text-xs text-neutral-500">{q.rationale}</td>
                              {/* Compliance — no backend field exists yet. Add
                                  complianceVerified?: boolean and complianceDocs?: string[]
                                  to SupplierQuote to replace this placeholder with real data. */}
                              <td className="px-4 py-2 text-[10px] text-neutral-400">Not tracked yet</td>
                              <td className="px-4 py-2 text-right">
                                <div className="flex flex-col items-end gap-1.5">
                                  {isWeb ? (
                                    <a
                                      href={webRfqHref(liq.lineItem, q)}
                                      {...(q.contactEmail
                                        ? {}
                                        : { target: "_blank", rel: "noopener noreferrer" })}
                                      className="inline-block whitespace-nowrap rounded-md border border-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-[#3d6bff] transition hover:bg-[#eef2ff]"
                                    >
                                      {q.contactEmail ? "Request quote" : "Open supplier site"}
                                    </a>
                                  ) : planNumber !== null && canApprove ? (
                                    <button
                                      onClick={() =>
                                        startApprove(planNumber === 0 ? undefined : planNumber, rowSource)
                                      }
                                      disabled={approvingSource === rowSource}
                                      className="whitespace-nowrap rounded-md bg-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-40"
                                    >
                                      {approvingSource === rowSource ? "Approving…" : "Approve & Order"}
                                    </button>
                                  ) : isLocked ? (
                                    isApprovedRow ? (
                                      state.status === "purchasing" || approve.isPending ? (
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[#3d6bff]/10 px-3 py-1.5 text-[11px] font-medium text-[#3d6bff]">
                                          Placing order…
                                        </span>
                                      ) : (
                                        <>
                                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-green-100 px-3 py-1.5 text-[11px] font-medium text-green-700">
                                            <Check size={12} strokeWidth={3} />
                                            Approved
                                          </span>
                                          <a
                                            href={buildRfqMailHref(liq.lineItem, q)}
                                            className="inline-block whitespace-nowrap rounded-md border border-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-[#3d6bff] transition hover:bg-[#eef2ff]"
                                          >
                                            Trigger Auto-RFQ
                                          </a>
                                        </>
                                      )
                                    ) : (
                                      <button
                                        onClick={() =>
                                          startApprove(
                                            planNumber === 0 ? undefined : (planNumber ?? undefined),
                                            rowSource
                                          )
                                        }
                                        disabled={planNumber === null || approvingSource === rowSource}
                                        title={
                                          planNumber === null
                                            ? "This quote isn't part of any fulfilment plan"
                                            : undefined
                                        }
                                        className="whitespace-nowrap rounded-md border border-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-[#3d6bff] transition hover:bg-[#eef2ff] disabled:opacity-40"
                                      >
                                        {approvingSource === rowSource ? "Selecting…" : "Select"}
                                      </button>
                                    )
                                  ) : (
                                    <a
                                      href={buildRfqMailHref(liq.lineItem, q)}
                                      className="inline-block whitespace-nowrap rounded-md border border-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-[#3d6bff] transition hover:bg-[#eef2ff]"
                                    >
                                      Trigger Auto-RFQ
                                    </a>
                                  )}
                                  {href && (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-medium text-neutral-400 hover:text-neutral-700"
                                    >
                                      {isWeb ? "View source" : "View supplier"}
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isLocked && approve.isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {(approve.error as Error).message}
          </div>
        )}

        {state.status === "rfq_sent" && state.rfqResults && state.rfqResults.length > 0 && (
          <div className="space-y-1 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <p className="font-medium">
              RFQ sent to {state.rfqResults.map((r) => r.supplierName).join(", ")}. Waiting for supplier
              replies. No order is final until a supplier confirms.
            </p>
            {state.rfqResults.map((r) => (
              <p key={r.supplierId} className="text-xs">
                {r.supplierName}
                {r.referenceNumber ? ` · ${r.referenceNumber}` : ""}
                {r.emailed === false
                  ? " · email not delivered; the supplier will see it in their dashboard"
                  : ""}
              </p>
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

function PlanCard({
  plan,
  show,
  highlight,
  onApprove,
  approving,
}: {
  plan: FulfillmentPlan;
  /** Formats an amount (in the given source currency) in the buyer's display currency. */
  show: (amount: number, from: string) => string;
  highlight?: boolean;
  /** When provided, shows an "Approve this plan" button for an alternative plan. */
  onApprove?: () => void;
  /** True only while THIS plan is the one being approved (drives the "Approving…" label). */
  approving?: boolean;
}) {
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
          {show(plan.totalCost, BUYER_CURRENCY)}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">{plan.rationale}</p>
      <div className="mt-2 space-y-1">
        {plan.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between text-xs text-neutral-600">
            <span>
              {leg.supplierName} — {leg.lineItems.map((li) => li.item).join(", ")}
            </span>
            <span>{show(leg.legCost, BUYER_CURRENCY)}</span>
          </div>
        ))}
      </div>
      {plan.unmatchedItems.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          No registered supplier found for: {plan.unmatchedItems.map((li) => li.item).join(", ")}
        </p>
      )}
      {onApprove && (
        <button
          onClick={onApprove}
          disabled={approving}
          className="mt-3 rounded-md border border-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-[#3d6bff] transition hover:bg-[#eef2ff] disabled:opacity-40"
        >
          {approving ? "Approving…" : "Approve this plan instead"}
        </button>
      )}
    </div>
  );
}