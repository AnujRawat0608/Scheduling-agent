"use client";

import { ShieldCheck, Globe } from "lucide-react";
import type { QuoteScore } from "../lib/procurementApi";

export function SupplierBadge({ quote }: { quote: QuoteScore }) {
  const isVerified = !!quote.supplierId && !quote.simulated;
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
        <ShieldCheck size={10} strokeWidth={2.5} />
        Verified Partner
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      <Globe size={10} strokeWidth={2.5} />
      AI Ingested / Web
    </span>
  );
}