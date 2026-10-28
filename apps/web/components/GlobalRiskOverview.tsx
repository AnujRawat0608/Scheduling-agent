"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { fetchChokepointStatuses, type ChokepointStatus } from "../lib/riskAgentApi";

const STATUS_DOT: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const MODE_LABEL: Record<string, string> = {
  maritime: "Sea",
  air: "Air",
  land: "Land",
  rail: "Rail",
};

/**
 * Compact live overview of all tracked chokepoints, meant to sit above the
 * request composer on the "new procurement request" page — gives a
 * before-you-even-submit picture of current global route risk. Separate
 * from RiskAssessmentBadge, which shows risk for one specific task's
 * recommended supplier.
 *
 * `affectedSuppliers`: when a request is open, how many of its suppliers ship via a
 * flagged (elevated or critical) route. Undefined = no request yet, nothing is shown.
 */
export function GlobalRiskOverview({ affectedSuppliers }: { affectedSuppliers?: number }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["chokepoint-statuses"],
    queryFn: () => fetchChokepointStatuses(),
    refetchInterval: 60_000, // this data changes on a ~15-30min ingestion cycle, no need to poll fast
  });

  const redCount = data?.filter((c) => c.status === "red").length ?? 0;
  const yellowCount = data?.filter((c) => c.status === "yellow").length ?? 0;

  return (
    <div className="mb-4 rounded-2xl border border-neutral-200 bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Global route risk (to get detailed information about risk visit risk analysis)
          </span>
          {!isLoading && !error && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              {redCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {redCount} critical
                </span>
              )}
              {yellowCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  {yellowCount} elevated
                </span>
              )}
              {redCount === 0 && yellowCount === 0 && "All routes normal"}
            </span>
          )}
          {affectedSuppliers !== undefined && affectedSuppliers > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle size={11} />
              {affectedSuppliers} of your suppliers {affectedSuppliers === 1 ? "ships" : "ship"} via an affected route
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 px-5 py-4">
          {isLoading && <p className="text-xs text-neutral-400">Loading…</p>}
          {error && <p className="text-xs text-red-600">Couldn't load risk data.</p>}

          {data && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.map((cp: ChokepointStatus) => (
                <div
                  key={cp.id}
                  className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[cp.status ?? ""] ?? "bg-neutral-300"}`}
                    />
                    <span className="text-neutral-700">{cp.name}</span>
                  </div>
                  <span className="text-neutral-400">{MODE_LABEL[cp.mode] ?? cp.mode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}