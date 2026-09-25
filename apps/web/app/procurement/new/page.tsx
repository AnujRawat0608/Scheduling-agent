"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GlobalRiskOverview } from "../../../components/GlobalRiskOverview";
import { RiskAssessmentBadge } from "../../../components/RiskAssessmentBadge";
import { Paperclip, ArrowUp, X, ExternalLink, Check } from "lucide-react";
import {
  createProcurementTask,
  fetchProcurementTask,
  type QuoteScore,
  type FulfillmentPlan,
} from "../../../lib/procurementApi";

type SourceMode = "plm" | "bom" | "type";

const DEFAULT_REQUESTER_EMAIL = "team@procurement.local";
const EXAMPLE_PROMPT = "We need 50 units of Raspberry Pi 5 for the hardware team by [Date].";

const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  awaiting_approval: "bg-blue-100 text-blue-700",
  purchasing: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function NewProcurementPage() {
  
  const [mode, setMode] = useState<SourceMode>("type");
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [useRiskAnalysis, setUseRiskAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const create = useMutation({
    mutationFn: createProcurementTask,
    onSuccess: (data) => {
      setActiveTaskId(data.taskId);
      setText("");
      setAttachedFile(null);
    },
  });

  const { data, isLoading: isLoadingResult } = useQuery({
    queryKey: ["procurement", activeTaskId],
    queryFn: () => fetchProcurementTask(activeTaskId as string),
    enabled: !!activeTaskId,
    refetchInterval: (query) => {
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" ? false : 2000;
    },
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({ name: file.name, content: String(reader.result ?? "") });
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    const requestText = attachedFile
      ? `${attachedFile.content}${text.trim() ? `\n\nAdditional instructions: ${text.trim()}` : ""}`
      : text.trim();

    if (!requestText) return;

    setHasSubmitted(true);

    create.mutate({
      text: requestText,
      requesterEmail: DEFAULT_REQUESTER_EMAIL,
      useRiskAnalysis,
    });
  }

  const canSubmit = mode === "bom" ? Boolean(attachedFile) : Boolean(text.trim());

  const state = data?.state;
  const task = data?.task;
  

  return (
    <main className="m-full px-6 py-16">
      <GlobalRiskOverview />

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Your team</p>
            <h1 className="mt-0.5 text-xl font-semibold text-neutral-900">New request</h1>
          </div>

          <div className="flex gap-1.5">
            <SourceTab label="From your PLM" disabled />
            <SourceTab label="Paste a BOM" active={mode === "bom"} onClick={() => setMode("bom")} />
            <SourceTab label="Just type it" active={mode === "type"} onClick={() => setMode("type")} />
          </div>
        </div>

        <label className="mb-4 flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={useRiskAnalysis}
            onChange={(e) => setUseRiskAnalysis(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
          />
          Use supply chain risk analysis
        </label>

        {mode === "type" && (
          <button
            onClick={() => setText(EXAMPLE_PROMPT)}
            className="block w-full rounded-xl bg-blue-50 p-4 text-left transition hover:bg-blue-100"
          >
            <p className="text-[15px] leading-relaxed text-neutral-800">
              Here is the part, the quantity, and the date it has to land.
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-500">
              <Paperclip size={12} />
              example prompt click to use
            </span>
          </button>
        )}

        {mode === "bom" && (
          <div className="rounded-xl border border-dashed border-neutral-300 p-4">
            {attachedFile ? (
              <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <span className="flex items-center gap-2 text-sm text-neutral-700">
                  <Paperclip size={14} />
                  {attachedFile.name}
                </span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1 py-3 text-sm text-neutral-500 hover:text-neutral-700"
              >
                <Paperclip size={18} />
                Attach a BOM file (.csv or .txt)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>
        )}

        {create.isError && <p className="mt-3 text-sm text-red-600">{(create.error as Error).message}</p>}

        <div className="mt-4 flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={
              mode === "bom"
                ? "Add any instructions for this BOM…"
                : "Ask the agent to dispatch to custom sources or add instructions…"
            }
            className="flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
          <button
            onClick={handleSubmit}
            disabled={create.isPending || !canSubmit}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      {/* Results panel — appears once a request has been sent, updates in place */}
      {activeTaskId && (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-medium text-neutral-900">
                {isLoadingResult && !task ? "Loading…" : task?.itemsSummary ?? ""}
              </h2>
              {state && (
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
              )}
            </div>

            
              <a href={`/procurement/${activeTaskId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
            >
              Open in new tab
              <ExternalLink size={12} />
            </a>
          </div>

          {state?.riskCheckStatus && state.riskAssessment && (
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
          {state?.riskCheckStatus && !state.riskAssessment && (
            <RiskAssessmentBadge riskCheckStatus={state.riskCheckStatus} riskAssessment={null} />
          )}

          {hasSubmitted && state?.status !== "done" && state?.status !== "failed" && (
            <ProcessTracker currentIndex={toStageIndex(hasSubmitted, state?.status)} />
          )}

          {/* Consolidated view — the recommended plan, plus other viable combinations */}
          {state?.recommendedPlan && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Recommended plan
              </h3>
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
          {state?.lineItemQuotes && state.lineItemQuotes.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Per-item options
              </h3>
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
                            <th className="px-4 py-2">Estimated Total cost</th>
                            <th className="px-4 py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liq.topQuotes.map((q: QuoteScore) => (
                            <tr key={q.supplierName} className="border-t border-neutral-100">
                              <td className="px-4 py-2 font-medium text-neutral-900">
                                {q.supplierId ? (
                                  
                                  <a 
                                   href={`/suppliers/${q.supplierId}`}
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

          {state?.status === "done" && state.purchaseConfirmations && state.purchaseConfirmations.length > 0 && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Purchase confirmed with{" "}
              {state.purchaseConfirmations.map((c) => c.supplierName).join(", ")}.
            </div>
          )}

          {state?.status === "failed" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {state.failureReason ?? "This request couldn't be completed."}
            </div>
          )}
        </div>
      )}

      <footer className="mt-6 flex items-center justify-center gap-1 text-xs text-neutral-400">
        <span>Sourced against your supply chain catalog</span>
        <span>·</span>
        <a href="/procurement" className="text-neutral-500 hover:text-neutral-700 hover:underline">
          View past requests
        </a>
        <span>·</span>
        <a href="/supply-chain" className="text-neutral-500 hover:text-neutral-700 hover:underline">
          Manage suppliers
        </a>
      </footer>
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

function SourceTab({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Not connected yet" : undefined}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-blue-600 text-blue-600"
          : disabled
            ? "cursor-not-allowed border-neutral-200 text-neutral-300"
            : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}

const STAGES = [
  { key: "extracting", label: "Reviewing your prompt" },
  { key: "sourcing", label: "Finding supplier" },
  { key: "comparing", label: "Matching data" },
  { key: "result", label: "Result" },
] as const;

function ProcessTracker({ currentIndex }: { currentIndex: number }) {
  if (currentIndex < 0) return null;

  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const isLast = i === STAGES.length - 1;
        return (
          <div key={stage.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-all duration-500 ${
                  done
                    ? "border-green-500 bg-green-500 text-white scale-100"
                    : active
                      ? "border-blue-600 bg-white text-blue-600 scale-110"
                      : "border-neutral-200 bg-white text-neutral-300 scale-100"
                }`}
              >
                {active && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-40" />
                )}
                <span className={`transition-all duration-300 ${done ? "animate-[pop_0.3s_ease-out]" : ""}`}>
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
              </div>
              <span
                className={`whitespace-nowrap text-[11px] font-medium transition-colors duration-500 ${
                  done || active ? "text-neutral-700" : "text-neutral-400"
                }`}
              >
                {stage.label}
              </span>
            </div>
            {!isLast && (
              <div className="mx-1.5 h-0.5 flex-1 rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-700 ease-out"
                  style={{ width: done ? "100%" : "0%" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function toStageIndex(hasSubmitted: boolean, status?: string) {
  if (!hasSubmitted) return -1;
  if (!status || status === "extracting") return 0;
  if (status === "sourcing") return 1;
  if (status === "comparing") return 2;
  return 3;
}