"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Paperclip, ArrowUp, X, ExternalLink, Check } from "lucide-react";
import {
  createProcurementTask,
  fetchProcurementTask,
  approveProcurementTask,
  rejectProcurementTask,
  type QuoteScore,
} from "../../../lib/procurementApi";

type SourceMode = "plm" | "bom" | "type";

// No login/identity flow yet — every request is attributed to this
// placeholder until real user accounts exist. Swap this out first
// when that's built.
const DEFAULT_REQUESTER_EMAIL = "team@procurement.local";

const EXAMPLE_PROMPT = "We need 50 units of Raspberry Pi 5 for the hardware team by September 15.";

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [mode, setMode] = useState<SourceMode>("type");
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The task we just created — once set, the results panel below starts polling.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: createProcurementTask,
    onSuccess: (data) => {
      setActiveTaskId(data.taskId);
      setSelectedSupplier(null);
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

  const approve = useMutation({
    mutationFn: (supplierName?: string) =>
      approveProcurementTask(activeTaskId as string, supplierName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement", activeTaskId] });
      router.push("/routing");
    },
  });

  const reject = useMutation({
    mutationFn: (note?: string) =>
      rejectProcurementTask(activeTaskId as string, note ?? "Rejected by approver"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["procurement", activeTaskId] }),
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

    create.mutate({ text: requestText, requesterEmail: DEFAULT_REQUESTER_EMAIL });
  }

  const canSubmit = mode === "bom" ? Boolean(attachedFile) : Boolean(text.trim());

  const state = data?.state;
  const task = data?.task;
  const isAwaitingApproval = state?.status === "awaiting_approval";
  const activeSelection = selectedSupplier ?? state?.recommendedSupplier?.supplierName ?? null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs text-neutral-400">Your team</p>
            <h1 className="mt-0.5 text-xl font-semibold text-neutral-900">New request</h1>
          </div>

          <div className="flex gap-1.5">
            <SourceTab label="From your PLM" disabled />
            <SourceTab
              label="Paste a BOM"
              active={mode === "bom"}
              onClick={() => setMode("bom")}
            />
            <SourceTab
              label="Just type it"
              active={mode === "type"}
              onClick={() => setMode("type")}
            />
          </div>
        </div>

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

        {create.isError && (
          <p className="mt-3 text-sm text-red-600">{(create.error as Error).message}</p>
        )}

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
                {isLoadingResult && !task ? "Loading…" : `${state?.request?.quantity ?? ""}x ${task?.item ?? ""}`}
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

            <a
              href={`/procurement/${activeTaskId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
            >
              Open in new tab
              <ExternalLink size={12} />
            </a>
          </div>

          {isLoadingResult && !state && (
            <p className="text-sm text-neutral-500">Sourcing has started — this updates automatically.</p>
          )}

          {state?.scoredQuotes && state.scoredQuotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-neutral-700">Supplier quotes</h3>
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
                              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                <Check size={10} strokeWidth={3} />
                                Recommended
                              </span>
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

          {isAwaitingApproval && state?.recommendedSupplier && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-sm text-blue-900">
                Select a supplier above (recommendation is pre-selected), then confirm.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => activeSelection && approve.mutate(activeSelection)}
                  disabled={approve.isPending || reject.isPending || !activeSelection}
                  className="rounded-md bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
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

          {state?.status === "done" && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Purchase confirmed with {state.recommendedSupplier?.supplierName}.
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