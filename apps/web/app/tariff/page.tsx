"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { hasProcurerToken, fetchCurrentProcurer } from "../../lib/procurerAuthApi";
import { COUNTRIES } from "../../lib/countries";
import { formatMoney } from "../../lib/format";
import { estimateTariff, type DutyEstimate, type RestrictionNote } from "../../lib/tariffApi";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

const fieldClass =
  "h-9 w-full rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-900 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
    </label>
  );
}

function Restrictions({ items }: { items: RestrictionNote[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <div key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">
            {r.status === "prohibited" ? "Import prohibited" : "Import permit required"}
            {!r.verified && " (unverified)"}
          </p>
          <p className="mt-0.5">{r.note}</p>
          {r.sourceUrl && /^https?:\/\//.test(r.sourceUrl) && (
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline">
              Source
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TariffPage() {
  const router = useRouter();

  useEffect(() => {
    if (!hasProcurerToken()) router.replace("/procurement/login");
  }, [router]);

  // The buyer's own country is the usual destination, so prefill it (they can change it).
  const { data: buyer } = useQuery({ queryKey: ["procurer-me"], queryFn: fetchCurrentProcurer });

  const [hsCode, setHsCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [goodsValue, setGoodsValue] = useState("");
  const [shipping, setShipping] = useState("");
  const [insurance, setInsurance] = useState("");

  useEffect(() => {
    if (!destination && buyer?.country) setDestination(buyer.country.trim());
  }, [buyer, destination]);

  const estimate = useMutation({ mutationFn: estimateTariff });

  const canSubmit =
    hsCode.replace(/\D/g, "").length >= 4 && origin && destination && Number(goodsValue) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || estimate.isPending) return;
    estimate.mutate({
      hsCode,
      originCountry: origin,
      destinationCountry: destination,
      goodsValue: Number(goodsValue),
      shipping: shipping ? Number(shipping) : 0,
      insurance: insurance ? Number(insurance) : 0,
    });
  }

  const result: DutyEstimate | undefined = estimate.data;

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 pb-32 pt-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Your team</p>
          <h1 className="mt-1 text-lg font-semibold text-neutral-900">Import duty estimator</h1>
          <p className="mt-1 text-xs text-neutral-500">
            A planning estimate of customs duty for an import. It is not added to quote totals or
            supplier rankings.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-2"
        >
          <Field label="HS code" hint="At least 4 digits, e.g. 8523 or 8523.51">
            <input
              value={hsCode}
              onChange={(e) => setHsCode(e.target.value)}
              placeholder="8523.51"
              className={fieldClass}
            />
          </Field>

          <Field label="Goods currency" hint="Duty is shown in this currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Origin country (supplier)">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldClass}>
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Destination country (you)">
            <select value={destination} onChange={(e) => setDestination(e.target.value)} className={fieldClass}>
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Goods value">
            <input
              type="number"
              min="0"
              step="0.01"
              value={goodsValue}
              onChange={(e) => setGoodsValue(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>

          <Field label="Shipping (optional)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>

          <Field label="Insurance (optional)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
              placeholder="0.00"
              className={fieldClass}
            />
          </Field>

          <div className="flex items-end sm:justify-end">
            <button
              type="submit"
              disabled={!canSubmit || estimate.isPending}
              className="h-9 rounded-lg bg-[#EA580C] px-5 text-xs font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
            >
              {estimate.isPending ? "Estimating…" : "Estimate duty"}
            </button>
          </div>
        </form>

        {estimate.isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {(estimate.error as Error).message}
          </div>
        )}

        {result?.status === "domestic" && (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700 shadow-sm">
            Origin and destination are the same country, so no import duty applies.
          </div>
        )}

        {result?.status === "prohibited" && (
          <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-red-800">This product can’t be imported on this route</p>
            <Restrictions items={result.restrictions} />
          </div>
        )}

        {result?.status === "not_estimated" && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="text-amber-800">
              <p className="text-sm font-medium">Duty not estimated</p>
              <p className="mt-1 text-xs">{result.reason}</p>
            </div>
            <Restrictions items={result.restrictions} />
          </div>
        )}

        {result?.status === "estimated" && (
          <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Estimated import duty
                </p>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">
                  {formatMoney(result.dutyAmount, currency)}
                </p>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                {result.effectiveRatePercent}% of goods value
              </span>
            </div>

            {!result.allVerified && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Includes rates that haven’t been checked against an official source yet. Confirm before relying on this.
              </p>
            )}

            <Restrictions items={result.restrictions} />

            <table className="w-full text-xs">
              <thead className="border-b border-neutral-200 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="py-2">Measure</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">On value</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {result.components.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 text-neutral-800">
                      {c.name}
                      {!c.verified && <span className="ml-1.5 text-[10px] text-amber-700">unverified</span>}
                      {c.mode === "top_up_to" && (
                        <span className="block text-[10px] text-neutral-400">
                          Tops the standard duty up to {c.ratePercent}%
                        </span>
                      )}
                      {c.sourceUrl && /^https?:\/\//.test(c.sourceUrl) && (
                        <a
                          href={c.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[10px] text-neutral-400 underline"
                        >
                          Source
                        </a>
                      )}
                    </td>
                    <td className="py-2 text-right text-neutral-700">{c.appliedRatePercent}%</td>
                    <td className="py-2 text-right text-neutral-700">{formatMoney(c.dutiableValue, currency)}</td>
                    <td className="py-2 text-right font-medium text-neutral-900">{formatMoney(c.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="list-disc space-y-1 border-t border-neutral-100 pt-3 pl-4 text-[11px] text-neutral-500">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}