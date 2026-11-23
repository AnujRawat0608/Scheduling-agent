"use client";

import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useSupplierTrust } from "../lib/supplierTrustApi";

/**
 * Replaces the "Not tracked yet" placeholder in the Compliance column.
 * Opens the buyer-facing scorecard in the same tab.
 */
export function SupplierTrustCell({
  supplierId,
  isWeb,
}: {
  supplierId?: string | null;
  isWeb: boolean;
}) {
  const { data, isLoading, isError } = useSupplierTrust(isWeb ? null : supplierId);

  // Web results are not METIS suppliers, so there is nothing to look up.
  if (isWeb || !supplierId) {
    return <span className="text-[10px] text-amber-700">Unverified web source</span>;
  }

  if (isLoading) {
    return <div className="h-8 w-24 animate-pulse rounded bg-neutral-100" role="status" aria-label="Loading" />;
  }

  if (isError || !data) {
    return <span className="text-[10px] text-neutral-400">Details unavailable</span>;
  }

  const { compliance, performance } = data;
  const provided = compliance.documents.filter((d) => d.provided).length;
  const total = compliance.documents.length;

  const performanceLine =
    performance.onTimeRate !== null
      ? `${Math.round(performance.onTimeRate * 100)}% on-time`
      : performance.quoteResponseRate !== null
        ? `${Math.round(performance.quoteResponseRate * 100)}% quote response`
        : "New on METIS";

  return (
    <div className="space-y-1">
      {compliance.businessVerified && (
        <div className="flex items-center gap-1 text-[11px] font-medium text-green-700">
          <ShieldCheck size={12} />
          Verified business
        </div>
      )}

      <div
        className={`flex items-center gap-1 text-[11px] ${
          provided > 0 ? "font-medium text-neutral-700" : "text-neutral-400"
        }`}
      >
        {!compliance.businessVerified && (provided > 0 ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />)}
        {provided} of {total} documents
      </div>

      <div className="text-[10px] text-neutral-500">{performanceLine}</div>

      {/* Same tab on purpose: the buyer's login token lives in sessionStorage, which a new tab opened
          with noopener does not inherit. The request stays in the URL (?task=...), so Back returns to it. */}
      <Link
        href={`/procurement/suppliers/${supplierId}`}
        className="inline-block text-[10px] font-medium text-[#EA580C] hover:underline"
      >
        View scorecard
      </Link>
    </div>
  );
}