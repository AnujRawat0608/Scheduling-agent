"use client";

import { Check, Loader2 } from "lucide-react";
import type { ProcurementSnapshot } from "../lib/procurementApi";

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
  activeLabel: string;
  doneLabel: string;
  detail?: string;
}

// Details come from data already on the task snapshot, so nothing is invented.
function buildSteps(status?: string, state?: AgentState): Step[] {
  const items = state?.request?.lineItems ?? [];
  const lineQuotes = state?.lineItemQuotes ?? [];
  const matchedItems = lineQuotes.filter((l) => l.hasMatch).length;
  const supplierCount = new Set(
    lineQuotes.flatMap((l) => l.topQuotes.map((q) => q.supplierName))
  ).size;
  const planCount =
    (state?.recommendedPlan ? 1 : 0) + (state?.alternativePlans?.length ?? 0);

  const itemNames =
    items.slice(0, 3).map((i) => i.item).join(", ") +
    (items.length > 3 ? ` +${items.length - 3} more` : "");

  const finalLabel =
    status === "needs_info"
      ? "Needs more information from you"
      : status === "rfq_sent" || status === "done"
        ? "Completed"
        : "Ready for your review";

  return [
    {
      activeLabel: "Reading your request and extracting items…",
      doneLabel: "Understood your request",
      detail: items.length > 0 ? `${plural(items.length, "item")}: ${itemNames}` : undefined,
    },
    {
      activeLabel: "Searching for suppliers…",
      doneLabel: "Searched for suppliers",
      detail:
        lineQuotes.length > 0
          ? `${plural(supplierCount, "supplier")} matched for ${matchedItems} of ${plural(lineQuotes.length, "item")}`
          : undefined,
    },
    {
      activeLabel: "Comparing price, lead time and deadline…",
      doneLabel: "Compared quotes",
      detail: planCount > 0 ? `${plural(planCount, "fulfilment plan")} built` : undefined,
    },
    { activeLabel: finalLabel, doneLabel: finalLabel },
  ];
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
        if (i > current) return null; // steps appear as the agent reaches them
        const done = i < current || finished;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
              {done ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : (
                <Loader2 size={14} className="animate-spin text-[#EA580C]" />
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-xs ${done ? "text-neutral-600" : "font-medium text-neutral-900"}`}>
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
    return (
      <details className="rounded-lg border border-neutral-200 bg-neutral-50/60">
        <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-medium text-neutral-500 hover:text-neutral-700">
          What the agent did
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