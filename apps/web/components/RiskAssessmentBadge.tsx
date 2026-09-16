import type { RiskAssessment } from "../lib/procurementApi";

const STATUS_STYLES: Record<string, string> = {
  green: "border-green-200 bg-green-50 text-green-800",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
  red: "border-red-200 bg-red-50 text-red-800",
  unknown: "border-neutral-200 bg-neutral-50 text-neutral-600",
};

interface RiskAssessmentBadgeProps {
  riskCheckStatus?: "skipped" | "ok" | "unavailable";
  riskAssessment?: RiskAssessment | null;
}

/**
 * Purely presentational — reads risk fields already present on the
 * procurement task snapshot (no separate fetch/poll of its own, since
 * the parent page is already polling the full task via TanStack Query).
 */
export function RiskAssessmentBadge({ riskCheckStatus, riskAssessment }: RiskAssessmentBadgeProps) {
  if (!riskCheckStatus || riskCheckStatus === "skipped") {
    return null;
  }

  if (riskCheckStatus === "unavailable") {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        Risk data unavailable — proceeding without it.
      </div>
    );
  }

  if (!riskAssessment) return null;

  const style = STATUS_STYLES[riskAssessment.overall_status] ?? STATUS_STYLES.unknown;

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${style}`}>
      <div className="font-medium capitalize">Route risk: {riskAssessment.overall_status}</div>
      <p className="mt-1 text-xs opacity-90">{riskAssessment.recommendation}</p>
      {riskAssessment.chokepoints.length > 0 && (
        <p className="mt-1.5 text-xs opacity-75">
          {riskAssessment.chokepoints.map((c) => c.name).join(" · ")}
        </p>
      )}
    </div>
  );
}