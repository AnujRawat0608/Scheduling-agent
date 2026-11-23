"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Minus, ShieldCheck, ArrowLeft, Building2, AlertTriangle } from "lucide-react";
import { hasProcurerToken } from "../../../../lib/procurerAuthApi";
import { useSupplierTrust, type SupplierTrust } from "../../../../lib/supplierTrustApi";

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 100)}%`);

function memberSinceLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** One metric. A null value says why there is no number instead of showing a misleading 0. */
function Metric({ label, value, note }: { label: string; value: string | null; note: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      {value !== null ? (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
      ) : (
        <p className="mt-1 text-sm font-medium text-neutral-400">Not enough history yet</p>
      )}
      <p className="mt-1 text-[11px] text-neutral-400">{note}</p>
    </div>
  );
}

function DocStatus({ provided, verified, expired }: { provided: boolean; verified: boolean; expired: boolean }) {
  if (!provided) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
        <Minus size={14} /> Not provided
      </span>
    );
  }
  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <AlertTriangle size={14} /> Expired
      </span>
    );
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <ShieldCheck size={14} /> Verified by METIS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600">
      <Check size={14} /> Provided, not yet reviewed
    </span>
  );
}

function Scorecard({ t }: { t: SupplierTrust }) {
  const { compliance, performance } = t;
  const allReviewed =
    compliance.documents.every((d) => !d.provided || d.verified) && compliance.documents.some((d) => d.provided);

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EA580C]/10 text-[#EA580C]">
            <Building2 size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-neutral-900">{t.businessName}</h1>
              {compliance.businessVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                  <ShieldCheck size={12} />
                  Verified business
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-neutral-500">
              {[
                t.country ?? t.region,
                t.businessType,
                t.yearEstablished ? `Est. ${t.yearEstablished}` : null,
                t.totalEmployees,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p className="mt-1 text-xs text-neutral-400">On METIS since {memberSinceLabel(t.memberSince)}</p>
          </div>
        </div>
        {t.mainProducts && <p className="mt-3 text-xs text-neutral-600">Main products: {t.mainProducts}</p>}
      </header>

      <section aria-labelledby="perf">
        <h2 id="perf" className="mb-2 text-sm font-semibold text-neutral-900">
          Performance on METIS
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Orders handled"
            value={performance.ordersHandled === null ? null : `${performance.ordersHandled}+`}
            note="Confirmed, shipped or delivered"
          />
          <Metric label="On-time delivery" value={pct(performance.onTimeRate)} note="Delivered by the promised date" />
          <Metric label="Quote response" value={pct(performance.quoteResponseRate)} note="RFQs that received a quote" />
          <Metric label="Products listed" value={String(performance.catalogSize)} note="In their catalog" />
        </div>
        <p className="mt-2 text-[11px] text-neutral-400">
          Figures appear once a supplier has enough activity to be meaningful.
        </p>
      </section>

      <section aria-labelledby="comp" className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 id="comp" className="text-sm font-semibold text-neutral-900">
          Compliance
        </h2>

        <ul className="mt-3 divide-y divide-neutral-100">
          {compliance.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-neutral-700">{d.label}</span>
              <DocStatus provided={d.provided} verified={d.verified} expired={d.expired} />
            </li>
          ))}
          <li className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-neutral-700">GST registration</span>
            <DocStatus provided={compliance.gstProvided} verified={compliance.gstVerified} expired={false} />
          </li>
        </ul>

        {!allReviewed && (
          <p className="mt-3 text-[11px] text-neutral-400">
            Documents marked &quot;not yet reviewed&quot; were uploaded by the supplier and have not been checked by
            METIS. Confirm anything critical with the supplier before ordering.
          </p>
        )}
      </section>
    </div>
  );
}

export default function SupplierScorecardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [authed, setAuthed] = useState(false);

useEffect(() => {
  if (hasProcurerToken()) setAuthed(true);
  else router.replace("/procurement/login");
}, [router]);

useEffect(() => {
  window.scrollTo(0, 0);   
}, []);

  const { data, isLoading, isError, error } = useSupplierTrust(authed ? params.id : null);

  if (!authed) return null;

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 pb-16 pt-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/procurement/new"))}
          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
        >
          <ArrowLeft size={14} />
          Back to results
        </button>

        {isLoading && <div className="h-64 animate-pulse rounded-xl bg-white" role="status" aria-label="Loading" />}

        {isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {(error as Error)?.message ?? "Couldn't load this supplier."}{" "}
            <Link href="/procurement/new" className="underline">
              Return to your request
            </Link>
          </div>
        )}

        {data && <Scorecard t={data} />}
      </div>
    </main>
  );
}