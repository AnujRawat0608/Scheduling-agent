import Link from "next/link";
import type { RiskAssessment } from "../lib/procurementApi";

type Status = "green" | "yellow" | "red" | "unknown";

const STATUS_STYLES: Record<Status | "stale", string> = {
  green: "border-green-200 bg-green-50 text-green-800",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
  red: "border-red-200 bg-red-50 text-red-800",
  unknown: "border-neutral-200 bg-neutral-50 text-neutral-600",
  stale: "border-neutral-300 bg-neutral-100 text-neutral-500",
};

const STATUS_LABELS: Record<Status | "stale", string> = {
  green: "No alerts found",
  yellow: "Elevated risk",
  red: "Critical risk",
  unknown: "Not assessed for this lane",
  stale: "Stale data",
};

const STALE_AFTER_HOURS = 72;

interface RiskAssessmentBadgeProps {
  riskCheckStatus?: "skipped" | "ok" | "unavailable" | "no_country" | "domestic";
  /** One assessment per origin country, e.g. { China: {...}, Taiwan: {...} }. */
  riskAssessment?: Record<string, RiskAssessment> | RiskAssessment | null;
  destinationCountry?: string | null;
}

const NOTE_CLASS = "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500";

/** Older saved tasks hold a single assessment object; wrap it so both shapes render. */
function toRecord(value: RiskAssessmentBadgeProps["riskAssessment"]): Record<string, RiskAssessment> {
  if (!value) return {};
  if ("overall_status" in value) {
    const single = value as RiskAssessment;
    return { [single.supplier_region ?? "Route"]: single };
  }
  return value as Record<string, RiskAssessment>;
}

function latestComputedAt(a: RiskAssessment): Date | null {
  const times = (a.chokepoints ?? [])
    .map((c) => (c.computed_at ? new Date(c.computed_at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.max(...times)) : null;
}

function ageOf(d: Date): { text: string; hours: number } {
  const hours = (Date.now() - d.getTime()) / 36e5;
  if (hours < 1) return { text: "Updated just now", hours };
  if (hours < 48) return { text: `Updated ${Math.round(hours)}h ago`, hours };
  return { text: `Updated ${Math.round(hours / 24)}d ago`, hours };
}

/**
 * Purely presentational: reads risk fields already present on the procurement
 * task snapshot (no separate fetch/poll of its own, since the parent page is
 * already polling the full task via TanStack Query).
 */
export function RiskAssessmentBadge({
  riskCheckStatus,
  riskAssessment,
  destinationCountry,
}: RiskAssessmentBadgeProps) {
  // Check is off: the step list already says so, so no extra banner here.
  if (!riskCheckStatus || riskCheckStatus === "skipped") return null;

  if (riskCheckStatus === "unavailable") {
    return <div className={NOTE_CLASS}>Risk data unavailable — proceeding without it.</div>;
  }

  if (riskCheckStatus === "no_country") {
    return <div className={NOTE_CLASS}>Route risk check skipped: a supplier or delivery country is missing.</div>;
  }

  if (riskCheckStatus === "domestic") {
    return <div className={NOTE_CLASS}>No route risk analysis for shipments within the same country.</div>;
  }

  const entries = Object.entries(toRecord(riskAssessment));
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([originCountry, a]) => {
        const updated = latestComputedAt(a);
        const age = updated ? ageOf(updated) : null;
        const isStale = !!age && age.hours > STALE_AFTER_HOURS;
        const key: Status | "stale" = isStale ? "stale" : ((a.overall_status as Status) ?? "unknown");
        const style = STATUS_STYLES[key] ?? STATUS_STYLES.unknown;
        const quiet = key === "unknown" || key === "stale";
        const dest = a.destination_region ?? destinationCountry ?? "";
        const href = `/routing?origin=${encodeURIComponent(originCountry)}&destination=${encodeURIComponent(dest)}`;
        const events = isStale ? [] : (a.driving_events ?? []).slice(0, 3);

        return (
          <div key={originCountry} className={`rounded-lg border px-4 py-3 text-sm ${style}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{STATUS_LABELS[key]}</span>
              <span className="text-xs opacity-75">
                {originCountry}
                {dest ? ` → ${dest}` : ""}
              </span>
              <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Beta</span>
              {age && <span className="text-xs opacity-75">{age.text}</span>}
              {dest && (
                <Link href={href} className="ml-auto text-xs underline underline-offset-2">
                  View full lane
                </Link>
              )}
            </div>

            {isStale ? (
              <p className="mt-1 text-xs">This data is more than a day old, so it is not shown as current.</p>
            ) : (
              <p className="mt-1 text-xs opacity-90">{a.recommendation}</p>
            )}

            {!quiet && a.chokepoints.length > 0 && (
              <p className="mt-1.5 text-xs opacity-75">{a.chokepoints.map((c) => c.name).join(" · ")}</p>
            )}

            {events.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs opacity-90">
                {events.map((e) => (
                  <li key={e.headline}>{e.headline}</li>
                ))}
              </ul>
            )}

            {key === "green" && (
              <p className="mt-1 text-xs opacity-75">Based on recent public news. This is not a guarantee of safety.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}