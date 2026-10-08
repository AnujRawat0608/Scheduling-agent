"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "../../../lib/format";
import { useFxRates, useDisplayCurrency, convertAmount, DISPLAY_CURRENCIES } from "../../../lib/fxApi";
import { hasProcurerToken } from "../../../lib/procurerAuthApi";
import { GlobalRiskOverview } from "../../../components/GlobalRiskOverview";
import { RiskAssessmentBadge } from "../../../components/RiskAssessmentBadge";
import { SupplierBadge } from "../../../components/SupplierBadge";
import { findApprovalTarget, buildRfqMailHref } from "../../../lib/procurementSourcing";
import { Paperclip, ArrowUp, X, ExternalLink, Check, ChevronDown } from "lucide-react";
import { AgentActivity } from "../../../components/AgentActivity";

import {
  createProcurementTask,
  fetchProcurementTask,
  approveProcurementTask,
  type QuoteScore,
  type FulfillmentPlan,
} from "../../../lib/procurementApi";

type SourceMode = "plm" | "bom" | "type";
type Priority = "balanced" | "cheapest" | "fastest";
// Which suppliers to search. Sent to the backend as `sourceMode`.
type SearchScope = "registered" | "both" | "web";

const MAX_FILE_BYTES = 200 * 1024; // 200 KB is plenty for a BOM

// Builds the example with a real date (14 days out) so "[Date]" never reaches the agent.
function buildExamplePrompt() {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `We need 50 units of SanDisk Ultra 64GB microSD card for the hardware team by ${iso}.`;
}

/** Mail link for a supplier found on the web (not registered). Falls back to their page when no email is known. */
function webRfqHref(item: { item: string; quantity: number }, q: QuoteScore): string {
  if (!q.contactEmail) return q.sourceUrl ?? "#";
  const subject = encodeURIComponent(`Request for quotation: ${item.item} x ${item.quantity}`);
  const body = encodeURIComponent(
    `Hello ${q.supplierName},\n\nWe would like a quotation for ${item.quantity} x ${item.item}. ` +
      `Please confirm the unit price, stock, lead time, shipping and applicable taxes.\n\nThank you`
  );
  return `mailto:${q.contactEmail}?subject=${subject}&body=${body}`;
}

// The backend ranks and sums everything in this currency. The dropdown below only
// changes how amounts are DISPLAYED, so the ranking never changes when it is switched.
const BUYER_CURRENCY = "INR";

// Keys must match the backend's status values exactly (lowercase, snake_case).
// Capitalise only the DISPLAYED label (see statusLabel), never these keys or any
// `state.status === "..."` comparison.
const STATUS_STYLES: Record<string, string> = {
  extracting: "bg-neutral-100 text-neutral-600",
  sourcing: "bg-neutral-100 text-neutral-600",
  comparing: "bg-neutral-100 text-neutral-600",
  needs_info: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-amber-100 text-amber-800",
  purchasing: "bg-[#EA580C]/10 text-[#EA580C]",
  rfq_sent: "bg-green-100 text-green-700",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

/** "awaiting_approval" -> "Awaiting approval" (display only) */
function statusLabel(status: string): string {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Date-only strings ("2026-10-12") are parsed as UTC by `new Date()`, which can show the
// previous day in some timezones. Parse them as local dates instead.
function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

// NOTE: not exported on purpose. A Next.js page file may only export the page itself
// (plus a few special names), otherwise `next build` fails.
/** Labelled dropdown with a custom arrow, a consistent height and an orange focus ring. */
function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-8 text-xs font-medium text-neutral-900 shadow-sm outline-none transition hover:border-neutral-300 focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/20"
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
      </span>
    </label>
  );
}

export default function NewProcurementPage() {
  const qc = useQueryClient();
  const router = useRouter();

  // Buyers must be signed in: the server takes their identity from the login token.
  useEffect(() => {
    if (!hasProcurerToken()) router.replace("/procurement/login");
  }, [router]);

  const [mode, setMode] = useState<SourceMode>("type");
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [useRiskAnalysis, setUseRiskAnalysis] = useState(false);
  const [priority, setPriority] = useState<Priority>("balanced");
  const [scope, setScope] = useState<SearchScope>("registered");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Suppliers whose page the buyer has opened (keyed by supplierId, so reordering is safe)
  const [viewed, setViewed] = useState<Set<string>>(new Set());

  // Plan the buyer approved in this session (0 = recommended, n = alternativePlans[n - 1]).
  // After a reload this is null and rows fall back to matching the RFQ results by supplier.
  const [approvedPlan, setApprovedPlan] = useState<number | null>(null);

  // Display currency (buyer's choice, remembered in the browser) + live exchange rates
  const { data: fx } = useFxRates();
  const [displayCurrency, setDisplayCurrency] = useDisplayCurrency(BUYER_CURRENCY);

  const create = useMutation({
    mutationFn: createProcurementTask,
    onSuccess: (data) => {
      setActiveTaskId(data.taskId);
      setApprovedPlan(null);
      setViewed(new Set());
      setText("");
      setAttachedFile(null);
    },
  });

  const {
    data,
    isLoading: isLoadingResult,
    isError: isResultError,
    error: resultError,
  } = useQuery({
    queryKey: ["procurement", activeTaskId],
    queryFn: () => fetchProcurementTask(activeTaskId as string),
    enabled: !!activeTaskId,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false; // don't poll forever on failures
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" || status === "rfq_sent" ? false : 2000;
    },
  });

  // NOTE: accepts an optional selectedPlanIndex so per-row "Approve & Order"
  // can target the exact plan that matches that row's supplier, instead of
  // always approving the recommended plan.
  //
  // ⚠️ VERIFY: this assumes selectedPlanIndex 1 → alternativePlans[0],
  // 2 → alternativePlans[1], etc. (a 1-based offset, since 0/undefined means
  // "recommended"). Confirm this matches your backend's /approve handler
  // before relying on it for a real purchase — if your backend instead treats
  // selectedPlanIndex as a direct array index into alternativePlans, every
  // non-recommended approval here would target the wrong plan.
  const approve = useMutation({
    mutationFn: ({ plan }: { plan?: number; source: string }) =>
      approveProcurementTask(activeTaskId as string, plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["procurement", activeTaskId] }),
  });

  // Which exact button was clicked? e.g. "recommended", "alt-0", "row-0-2".
  // null = nothing in flight. Each button compares against its own key, so only the
  // clicked one shows "Approving…" even when several buttons approve the same plan.
  const approvingSource: string | null = approve.isPending
    ? (approve.variables?.source ?? null)
    : null;

  // Blocks a second approval while one is in flight, without greying out the other buttons.
  function startApprove(plan: number | undefined, source: string) {
    if (approve.isPending) return;
    // Remember the choice right away: the backend flips the status to "purchasing" while
    // the request is still running, and polling would otherwise render every row as
    // "Not selected" until the request finishes.
    const previous = approvedPlan;
    setApprovedPlan(plan ?? 0);
    approve.mutate({ plan, source }, { onError: () => setApprovedPlan(previous) });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setFileError(null);

    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File is too large (max ${MAX_FILE_BYTES / 1024} KB).`);
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({ name: file.name, content: String(reader.result ?? "") });
      input.value = ""; // lets the same file be selected again later
    };
    reader.onerror = () => {
      setFileError("Couldn't read that file. Please try again.");
      input.value = "";
    };
    reader.readAsText(file);
  }

  const canSubmit =
    (mode === "bom" ? Boolean(attachedFile) : Boolean(text.trim())) && !text.includes("[Date]");

  function handleSubmit() {
    if (!canSubmit || create.isPending) return;

    const requestText = attachedFile
      ? `${attachedFile.content}${text.trim() ? `\n\nAdditional instructions: ${text.trim()}` : ""}`
      : text.trim();

    if (!requestText) return;

    // No requester email here: the server reads it from the buyer's login token.
    create.mutate({
      text: requestText,
      useRiskAnalysis,
      priority,
      sourceMode: scope,
    });
  }

  /* ---------- display-currency helpers ---------- */

  /** Show an amount (in currency `from`) in the chosen display currency.
   *  If a rate is missing it falls back to the original currency, correctly labelled. */
  function money(amount: number, from: string): string {
    const converted = convertAmount(fx, amount, from, displayCurrency);
    return converted === null ? formatMoney(amount, from) : formatMoney(converted, displayCurrency);
  }

  /** A line of a quote's price breakdown in the display currency.
   *  When the display currency is the buyer currency, use the server's own numbers
   *  so they match the plan card and the saved total exactly. */
  function quoteAmount(q: QuoteScore, field: "total" | "taxAmount" | "shipping"): string {
    if (!q.pricing) return q.totalCost === null ? "—" : money(q.totalCost, q.buyerCurrency);
    if (displayCurrency === q.pricing.buyerCurrency) {
      return formatMoney(q.pricing.converted[field], q.pricing.buyerCurrency);
    }
    return money(q.pricing.local[field], q.pricing.supplierCurrency);
  }

  /** "≈ ..." line under the supplier's own unit price, or null if there is nothing to add. */
  function unitApprox(q: QuoteScore): string | null {
    if (displayCurrency === q.currency) return null;
    if (q.pricing && displayCurrency === q.pricing.buyerCurrency) {
      return formatMoney(q.pricing.unitPriceConverted, q.pricing.buyerCurrency);
    }
    const converted = convertAmount(fx, q.unitPrice, q.currency, displayCurrency);
    return converted === null ? null : formatMoney(converted, displayCurrency);
  }

  /** "1 USD = 96.379 INR" style rate note, or null if the currencies match or a rate is missing. */
  function rateLine(q: QuoteScore): string | null {
    if (displayCurrency === q.currency) return null;
    let rate: number | null = null;
    if (q.pricing && displayCurrency === q.pricing.buyerCurrency) {
      rate = q.pricing.fxRate;
    } else if (fx?.rates[q.currency] && fx.rates[displayCurrency]) {
      rate = fx.rates[displayCurrency] / fx.rates[q.currency];
    }
    if (rate === null) return null;
    return `1 ${q.currency} = ${rate.toLocaleString("en-US", { maximumSignificantDigits: 5 })} ${displayCurrency}`;
  }

  const ratesAsOf = fx
    ? new Date(fx.fetchedAt).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const state = data?.state;
  const task = data?.task;
  // Once approved, the task leaves "awaiting_approval" and per-row actions are no longer valid.
  const isLocked = !!state && ["purchasing", "rfq_sent", "done"].includes(state.status);
  const isProcessing =
    !!state && ["extracting", "sourcing", "comparing"].includes(state.status);

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 py-16">
      <GlobalRiskOverview />

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Your team</p>
            <h1 className="mt-1 text-base font-semibold text-neutral-900">New request</h1>
          </div>

          <div className="flex gap-1.5">
            <SourceTab label="From your PLM" disabled />
            <SourceTab label="Paste a BOM" active={mode === "bom"} onClick={() => setMode("bom")} />
            <SourceTab label="Just type it" active={mode === "type"} onClick={() => setMode("type")} />
          </div>
        </div>

        {/* Request options */}
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-lg bg-neutral-50 px-3.5 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-700">
            <input
              type="checkbox"
              checked={useRiskAnalysis}
              onChange={(e) => setUseRiskAnalysis(e.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-neutral-300 accent-[#EA580C] focus:ring-[#EA580C]"
            />
            Use supply chain risk analysis
          </label>

          <span className="hidden h-5 w-px bg-neutral-200 sm:block" aria-hidden />

          <SelectField label="Prioritise" value={priority} onChange={(v) => setPriority(v as Priority)}>
            <option value="balanced">Balanced</option>
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
          </SelectField>

          <SelectField label="Search" value={scope} onChange={(v) => setScope(v as SearchScope)}>
            <option value="registered">Registered suppliers</option>
            <option value="both">Registered + web</option>
            <option value="web">Web only</option>
          </SelectField>

          {scope !== "registered" && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Web results are unverified and slower to load. Confirm prices with the supplier.
            </span>
          )}
        </div>

        {mode === "type" && (
          <button
            onClick={() => setText(buildExamplePrompt())}
            className="block w-full rounded-md bg-[#EA580C]/10 p-3.5 text-left transition hover:bg-[#EA580C]/20"
          >
            <p className="text-xs leading-relaxed text-neutral-800">
              Here is the part, the quantity, and the date it has to land.
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-500">
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
            {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
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
        {text.includes("[Date]") && (
          <p className="mt-3 text-xs text-amber-700">Replace [Date] with the date you need the items by.</p>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            }}
            aria-label="Procurement request"
            placeholder={
              mode === "bom"
                ? "Add any instructions for this BOM…"
                : "Ask the agent to dispatch to custom sources or add instructions…"
            }
            className="flex-1 bg-transparent text-xs text-neutral-800 outline-none placeholder:text-neutral-400"
          />
          <button
            onClick={handleSubmit}
            disabled={create.isPending || !canSubmit}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EA580C] text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      {/* Results panel — appears once a request has been sent, updates in place */}
      {activeTaskId && (
        <div className="mt-6 space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {isLoadingResult && !task ? "Loading…" : task?.itemsSummary ?? ""}
              </h2>
              {state && (
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[state.status] ?? "bg-neutral-100 text-neutral-600"}`}
                  >
                    {statusLabel(state.status)}
                  </span>
                  {state.request?.requiredBy && (
                    <span className="text-xs text-neutral-500">
                      needed by {formatDate(state.request.requiredBy)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <a
                href={`/procurement/${activeTaskId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800"
              >
                Open in new tab
                <ExternalLink size={12} />
              </a>

              {/* Display currency: changes how amounts are shown, not how suppliers are ranked */}
              <SelectField label="Show Estimated Total in" value={displayCurrency} onChange={setDisplayCurrency}>
                {DISPLAY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
              {displayCurrency !== BUYER_CURRENCY && (
                <p className="max-w-[260px] text-right text-[10px] text-neutral-400">
                  {fx
                    ? `Approximate, converted at rates from ${ratesAsOf}. Suppliers invoice in their own currency.`
                    : "Exchange rates unavailable right now, showing original currencies."}
                </p>
              )}
            </div>
          </div>

          {isResultError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {(resultError as Error)?.message ?? "Couldn't load this request."} Refresh the page to try again.
            </div>
          )}

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

          {!isResultError && <AgentActivity status={state?.status} state={state} />}

          {/* Consolidated view — the recommended plan, plus other viable combinations */}
          {state?.recommendedPlan && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Recommended plan
              </h3>
              <PlanCard plan={state.recommendedPlan} show={money} highlight />

              {state.status === "awaiting_approval" && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startApprove(undefined, "recommended")}
                    disabled={approvingSource === "recommended"}
                    className="rounded-md bg-[#EA580C] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
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
                  <summary className="cursor-pointer px-3.5 py-2 text-[11px] font-medium text-neutral-500 hover:text-neutral-700">
                    {state.alternativePlans.length} other viable combination
                    {state.alternativePlans.length === 1 ? "" : "s"}
                  </summary>
                  <div className="space-y-2 border-t border-neutral-100 p-3">
                    {state.alternativePlans.map((plan, i) => (
                      <PlanCard
                        key={i}
                        plan={plan}
                        show={money}
                        onApprove={
                          state.status === "awaiting_approval"
                            ? () => startApprove(i + 1, `alt-${i}`)
                            : undefined
                        }
                        approving={approvingSource === `alt-${i}`}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {state?.status === "done" &&
            !state.recommendedPlan &&
            state.lineItemQuotes?.some((liq) => liq.topQuotes.some((q) => q.source && q.source !== "registered")) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                These results were found on the web and are
                unverified, so request a quote from the supplier directly.
              </div>
            )}

          {/* Per-item view — each line item's top matching suppliers */}
          {state?.lineItemQuotes && state.lineItemQuotes.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Per-item options
              </h3>
              {state.lineItemQuotes.map((liq, i) => {
                const noneOnTime =
                  liq.topQuotes.length > 0 && liq.topQuotes.every((q) => q.meetsDeadline === false);
                return (
                  <div key={i} className="space-y-2">
                    <p className="text-xs font-semibold text-neutral-800">
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
                      <>
                        {noneOnTime && (
                          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            No supplier can deliver by the required date. The earliest is{" "}
                            {Math.min(...liq.topQuotes.map((q) => q.leadTimeDays))} days.
                          </p>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-neutral-200">
                          <table className="w-full text-xs">
                            <thead className="border-b border-neutral-200 bg-neutral-50 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                              <tr>
                                <th className="px-4 py-3 text-left">Supplier</th>
                                <th className="px-4 py-3 text-right">Unit price</th>
                                <th className="px-4 py-3 text-center">Lead time</th>
                                <th className="px-4 py-3 text-right">Estimated total</th>
                                <th className="px-4 py-3 text-left">AI sourcing notes</th>
                                <th className="px-4 py-3 text-left">Compliance</th>
                                <th className="px-4 py-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200">
                              {liq.topQuotes.map((q: QuoteScore, j: number) => {
                                const rowKey = `${i}-${q.supplierId ?? q.supplierName}-${j}`;
                                const isWeb = !!q.source && q.source !== "registered";
                                const href = isWeb
                                  ? q.sourceUrl
                                  : q.supplierId
                                    ? `/suppliers/${q.supplierId}`
                                    : undefined;
                                const isViewed = !!q.supplierId && viewed.has(q.supplierId);

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
                                const planNumber = approvalTarget && !isWeb
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

                                // Small grey line under the total: tax, shipping, and the rate used.
                                const detailParts: string[] = [];
                                if (q.pricing) {
                                  if (q.pricing.converted.taxAmount > 0) {
                                    detailParts.push(
                                      `${q.pricing.taxInclusive ? "incl." : "+"} ${quoteAmount(q, "taxAmount")} tax`
                                    );
                                  }
                                  detailParts.push(
                                    q.pricing.converted.shipping > 0
                                      ? `${quoteAmount(q, "shipping")} shipping`
                                      : q.shippingKnown === false
                                        ? "shipping not quoted"
                                        : "free shipping"
                                  );
                                  const rl = rateLine(q);
                                  if (rl) detailParts.push(rl);
                                }
                                const approx = unitApprox(q);

                                return (
                                  <tr key={rowKey} className={q.isBest ? "bg-green-50/40" : "hover:bg-slate-50"}>
                                    {/* Supplier */}
                                    <td className="px-4 py-3 font-medium">
                                      {href ? (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() =>
                                            q.supplierId &&
                                            setViewed((s) => new Set(s).add(q.supplierId as string))
                                          }
                                          className="text-[#EA580C] hover:underline"
                                        >
                                          {q.supplierName}
                                        </a>
                                      ) : (
                                        <span className="text-neutral-900">{q.supplierName}</span>
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
                                    <td className="px-4 py-3 text-right font-mono text-xs text-neutral-700">
                                      <div>{formatMoney(q.unitPrice, q.currency)}</div>
                                      {approx && <div className="text-[10px] text-neutral-400">≈ {approx}</div>}
                                    </td>

                                    {/* Lead time, judged against the deadline when the backend provides it */}
                                    <td className="px-4 py-3 text-center">
                                      <span
                                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                          q.meetsDeadline === false
                                            ? "bg-red-100 text-red-700"
                                            : q.meetsDeadline === true
                                              ? "bg-green-100 text-green-700"
                                              : "bg-neutral-100 text-neutral-600"
                                        }`}
                                      >
                                        {q.leadTimeDays} {q.leadTimeDays === 1 ? "day" : "days"}
                                      </span>
                                      {q.meetsDeadline === false && (
                                        <div className="mt-1 text-[10px] font-medium text-red-600">
                                          Misses deadline
                                        </div>
                                      )}
                                    </td>

                                    {/* Estimated total, in the display currency ("—" if it couldn't be priced) */}
                                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-neutral-900">
                                      <div>{quoteAmount(q, "total")}</div>
                                      {detailParts.length > 0 && (
                                        <div className="text-[10px] font-normal text-neutral-400">
                                          {detailParts.join(" · ")}
                                        </div>
                                      )}
                                    </td>

                                    {/* AI sourcing notes */}
                                    <td className="px-4 py-3 text-xs">
                                      {q.isBest ? (
                                        <span className="inline-block rounded-md bg-green-50 px-2 py-1 font-medium text-green-700">
                                          {q.rationale}
                                        </span>
                                      ) : (
                                        <span className="text-neutral-500">{q.rationale}</span>
                                      )}
                                    </td>

                                    {/* Compliance — no backend field exists yet. Add
                                        complianceVerified?: boolean and complianceDocs?: string[]
                                        to SupplierQuote to replace this placeholder with real data. */}
                                    <td className="px-4 py-3 text-[10px] text-neutral-400">
                                      Not tracked yet
                                    </td>

                                    {/* Action: approve the exact plan that uses this supplier for
                                        this item (when one exists), otherwise trigger an RFQ. */}
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex flex-col items-end gap-1.5">
                                        {isWeb ? (
                                          <a
                                            href={webRfqHref(liq.lineItem, q)}
                                            {...(q.contactEmail
                                              ? {}
                                              : { target: "_blank", rel: "noopener noreferrer" })}
                                            className="inline-block whitespace-nowrap rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10"
                                          >
                                            {q.contactEmail ? "Request quote" : "Open supplier site"}
                                          </a>
                                        ) : planNumber !== null && state.status === "awaiting_approval" ? (
                                          <button
                                            onClick={() =>
                                              startApprove(
                                                planNumber === 0 ? undefined : planNumber,
                                                `row-${i}-${j}`
                                              )
                                            }
                                            disabled={approvingSource === `row-${i}-${j}`}
                                            className="whitespace-nowrap rounded-md bg-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
                                          >
                                            {approvingSource === `row-${i}-${j}` ? "Approving…" : "Approve & Order"}
                                          </button>
                                        ) : isLocked ? (
                                          isApprovedRow ? (
                                            state.status === "purchasing" || approve.isPending ? (
                                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-[#EA580C]/10 px-3 py-1.5 text-[11px] font-medium text-[#EA580C]">
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
                                                  className="inline-block whitespace-nowrap rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10"
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
                                                  `row-${i}-${j}`
                                                )
                                              }
                                              disabled={
                                                planNumber === null || approvingSource === `row-${i}-${j}`
                                              }
                                              title={
                                                planNumber === null
                                                  ? "This quote isn't part of any fulfilment plan"
                                                  : undefined
                                              }
                                              className="whitespace-nowrap rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10 disabled:opacity-40"
                                            >
                                              {approvingSource === `row-${i}-${j}` ? "Selecting…" : "Select"}
                                            </button>
                                          )
                                        ) : (
                                          <a
                                            href={buildRfqMailHref(liq.lineItem, q)}
                                            className="inline-block whitespace-nowrap rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10"
                                          >
                                            Trigger Auto-RFQ
                                          </a>
                                        )}
                                        {href && (
                                          <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() =>
                                              q.supplierId &&
                                              setViewed((s) => new Set(s).add(q.supplierId as string))
                                            }
                                            className="text-[10px] font-medium text-neutral-400 hover:text-neutral-700"
                                          >
                                            {isWeb ? "View source" : isViewed ? "Viewed" : "View supplier"}
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
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isLocked && approve.isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {(approve.error as Error).message}
            </div>
          )}

          {state?.status === "rfq_sent" && state.rfqResults && state.rfqResults.length > 0 && (
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
  const title =
    plan.type === "partial"
      ? "Partial fulfilment"
      : plan.legs.length === 1
        ? "Single Supplier"
        : `Split across ${plan.legs.length} suppliers`;

  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-green-200 bg-green-50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-900">{title}</span>
        <span className="text-xs font-semibold text-neutral-900">
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
          className="mt-3 rounded-md border border-[#EA580C] px-3 py-1.5 text-[11px] font-medium text-[#EA580C] transition hover:bg-[#EA580C]/10 disabled:opacity-40"
        >
          {approving ? "Approving…" : "Approve this plan instead"}
        </button>
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
      className={`rounded-md border bg-white px-3 py-1.5 text-[11px] font-medium transition ${
        active
          ? "border-[#EA580C] text-[#EA580C]"
          : disabled
            ? "cursor-not-allowed border-neutral-200 text-neutral-300"
            : "border-neutral-200 text-neutral-800 hover:border-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}