"use client";

import { Check, Loader2, Minus } from "lucide-react";
import type { ProcurementSnapshot, RiskAssessment } from "../lib/procurementApi";

type AgentState = ProcurementSnapshot["state"];

function stageIndex(status?: string): number {
  if (!status || status === "extracting") return 0;
  if (status === "sourcing") return 1;
  if (status === "comparing") return 2;
  return 3; // finished: awaiting_approval, needs_info, rfq_sent, done...
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

interface Step {
  /** The stage at which this step appears (0 = reading, 1 = sourcing, 2 = comparing, 3 = finished). */
  stage: number;
  activeLabel: string;
  doneLabel: string;
  detail?: string;
  /** Shown with a neutral dash instead of a green tick (step was skipped or had no data). */
  muted?: boolean;
}

/** What the route-risk check did, taken from the risk fields already on the task. */
function riskStep(state?: AgentState): Step | null {
  const check = state?.riskCheckStatus;
  if (!check) return null;

  if (check === "skipped") {
    return {
      stage: 3,
      muted: true,
      activeLabel: "",
      doneLabel: "Route risk check was off",
      detail: "Turn on “Use supply chain risk analysis” to flag risky shipping routes.",
    };
  }
  if (check === "unavailable") {
    return {
      stage: 3,
      muted: true,
      activeLabel: "",
      doneLabel: "Route risk data was unavailable",
      detail: "The request continued without it.",
    };
  }

  const risks = Object.values(state?.riskAssessment ?? {}) as RiskAssessment[];
  const red = risks.filter((r) => r.overall_status === "red").length;
  const yellow = risks.filter((r) => r.overall_status === "yellow").length;
  const green = risks.filter((r) => r.overall_status === "green").length;
  const parts = [
    red > 0 && `${red} critical`,
    yellow > 0 && `${yellow} elevated`,
    green > 0 && `${green} clear`,
  ].filter(Boolean);

  return {
    stage: 3,
    activeLabel: "",
    doneLabel: "Checked shipping route risk",
    detail:
      risks.length > 0
        ? `${plural(risks.length, "supplier region")}: ${parts.join(" · ")}`
        : "No route data for these suppliers",
  };
}

// Details come from data already on the task snapshot, so nothing is invented.
function buildSteps(status?: string, state?: AgentState): Step[] {
  const items = state?.request?.lineItems ?? [];
  const lineQuotes = state?.lineItemQuotes ?? [];
  const matchedItems = lineQuotes.filter((l) => l.hasMatch).length;
  const supplierCount = new Set(lineQuotes.flatMap((l) => l.topQuotes.map((q) => q.supplierName))).size;
  const planCount = (state?.recommendedPlan ? 1 : 0) + (state?.alternativePlans?.length ?? 0);

  const itemNames =
    items
      .slice(0, 3)
      .map((i) => i.item)
      .join(", ") + (items.length > 3 ? ` +${items.length - 3} more` : "");

  const finalLabel =
    status === "needs_info"
      ? "Needs more information from you"
      : status === "rfq_sent" || status === "done"
        ? "Completed"
        : "Ready for your review";

  const steps: Step[] = [
    {
      stage: 0,
      activeLabel: "Reading your request and extracting items…",
      doneLabel: "Understood your request",
      detail: items.length > 0 ? `${plural(items.length, "item")}: ${itemNames}` : undefined,
    },
    {
      stage: 1,
      activeLabel: "Searching for suppliers…",
      doneLabel: "Searched for suppliers",
      detail:
        lineQuotes.length > 0
          ? `${plural(supplierCount, "supplier")} matched for ${matchedItems} of ${plural(lineQuotes.length, "item")}`
          : undefined,
    },
    {
      stage: 2,
      activeLabel: "Comparing price, lead time and deadline…",
      doneLabel: "Compared quotes",
      detail: planCount > 0 ? `${plural(planCount, "fulfilment plan")} built` : undefined,
    },
  ];

  const risk = riskStep(state);
  if (risk) steps.push(risk);

  steps.push({ stage: 3, activeLabel: finalLabel, doneLabel: finalLabel });
  return steps;
}

/** One-line recap shown next to the heading when the panel is collapsed. */
function headline(state?: AgentState): string {
  const items = state?.request?.lineItems ?? [];
  const lineQuotes = state?.lineItemQuotes ?? [];
  const supplierCount = new Set(lineQuotes.flatMap((l) => l.topQuotes.map((q) => q.supplierName))).size;
  const planCount = (state?.recommendedPlan ? 1 : 0) + (state?.alternativePlans?.length ?? 0);
  return [
    items.length > 0 && plural(items.length, "item"),
    supplierCount > 0 && `${plural(supplierCount, "supplier")} compared`,
    planCount > 0 && plural(planCount, "plan"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AgentActivity({ status, state }: { status?: string; state?: AgentState }) {
  // The page already shows its own failure message.
  if (status === "failed") return null;

  const current = stageIndex(status);
  const finished = current >= 3;
  const steps = buildSteps(status, state);

  const list = (
    <ol className="space-y-2.5">
      {steps.map((step, i) => {
        if (step.stage > current) return null; // steps appear as the agent reaches them
        const done = step.stage < current || finished;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {done ? (
                step.muted ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
                    <Minus size={10} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )
              ) : (
                <Loader2 size={14} className="animate-spin text-[#EA580C]" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={`text-xs ${
                  done ? (step.muted ? "text-neutral-500" : "text-neutral-600") : "font-medium text-neutral-900"
                }`}
              >
                {done ? step.doneLabel : step.activeLabel}
              </p>
              {step.detail && <p className="mt-0.5 text-[11px] text-neutral-400">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );

  if (finished) {
    // Open while the buyer is deciding (review / needs info), then folds away once it's done.
    const openByDefault = status === "awaiting_approval" || status === "needs_info";
    const recap = headline(state);
    return (
      <details open={openByDefault} className="rounded-lg border border-neutral-200 bg-neutral-50/60">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 px-4 py-2.5 text-[11px] hover:text-neutral-700">
          <span className="font-medium text-neutral-600">What the agent did</span>
          {recap && <span className="text-neutral-400">· {recap}</span>}
        </summary>
        <div className="border-t border-neutral-100 p-4">{list}</div>
      </details>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-neutral-700">
        <span className="animate-pulse">Working on your request…</span>
      </div>
      {list}
    </div>
  );
}