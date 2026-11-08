"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { hasProcurerToken, fetchCurrentProcurer } from "../../lib/procurerAuthApi";
import { COUNTRIES } from "../../lib/countries";
import { formatMoney } from "../../lib/format";
import { estimateTariff, type DutyEstimate, type RestrictionNote } from "../../lib/tariffApi";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

// One place to change the palette (swap `goods` to #EA580C to match your brand orange).
const C = { goods: "#2563eb", freight: "#f59e0b", duty: "#ef4444", fees: "#16a34a" };

const fieldClass =
  "h-10 w-full rounded-lg bg-[#eceff6] px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-600/30";

/* ---------- small helpers ---------- */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] text-neutral-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
    </label>
  );
}

/** Smoothly counts a number up/down to `target`. Skips animation if the user prefers reduced motion. */
function useCountUp(target: number, ms = 600) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = a + (target - a) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function formatChecked(date: string | null): string {
  if (!date) return "no check date";
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Restrictions({ items }: { items: RestrictionNote[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-medium">
            {r.status === "prohibited" ? "Import prohibited" : "Import permit required"}
            {!r.verified && " (unverified)"}
            {r.stale && " (not checked recently)"}
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

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-[3px] bg-[#e3e8f6] px-1 text-xs text-neutral-600">{children}</span>;
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <Chip>{label}</Chip>
      <p className={`mt-1 text-[15px] font-semibold ${danger ? "text-red-500" : "text-neutral-900"}`}>{value}</p>
    </div>
  );
}

/* ---------- route + cost visual ---------- */

function RouteVisual({
  origin,
  destination,
  mode,
  dutyPercent,
}: {
  origin: string;
  destination: string;
  mode: "air" | "ocean";
  dutyPercent: number | null;
}) {
  const path = "M60 95 Q 260 -25 460 95";
  return (
    <svg viewBox="0 0 520 140" className="h-auto w-full" role="img" aria-label="Shipping route and duty point">
      <path d={path} fill="none" stroke={C.goods} strokeWidth="1.5" strokeDasharray="5 5" className="te-flow" />
      <path id="te-route" d={path} fill="none" stroke="none" />

      {/* origin */}
      <circle cx="60" cy="95" r="16" fill="#fff" stroke={C.goods} strokeWidth="1.5" />
      <circle cx="60" cy="95" r="3.5" fill={C.goods} />
      <text x="60" y="64" textAnchor="middle" fontSize="9" fill="#6b7280">Origin factory</text>
      <text x="60" y="128" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1f2430">{origin || "Select origin"}</text>

      {/* destination */}
      <circle cx="460" cy="95" r="16" fill="#fff" stroke={C.fees} strokeWidth="1.5" />
      <circle cx="460" cy="95" r="3.5" fill={C.fees} />
      <text x="460" y="64" textAnchor="middle" fontSize="9" fill="#6b7280">Port of entry</text>
      <text x="460" y="128" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1f2430">{destination || "Select destination"}</text>

      <text x="215" y="24" textAnchor="middle" fontSize="9" fill="#6b7280">
        {mode === "air" ? "Air express transit" : "Ocean cargo transit"}
      </text>

      {/* duty tag */}
      <line x1="360" y1="30" x2="360" y2="70" stroke={C.duty} strokeDasharray="2 3" />
      <g className="te-pop" key={dutyPercent ?? "none"}>
        <rect x="326" y="40" width="68" height="18" rx="3" fill="#fff" stroke={C.duty} />
        <text x="360" y="52.5" textAnchor="middle" fontSize="8.5" fill={C.duty}>
          {dutyPercent === null ? "Duty pending" : `+${dutyPercent}% duty`}
        </text>
      </g>

      {/* moving vehicle */}
      <g className="te-vehicle">
        <text fontSize="14" textAnchor="middle" dominantBaseline="central">
          {mode === "air" ? "✈️" : "🚢"}
          <animateMotion dur="6s" repeatCount="indefinite" rotate="0">
            <mpath href="#te-route" />
          </animateMotion>
        </text>
      </g>
    </svg>
  );
}

/* ---------- page ---------- */

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
  const [quantity, setQuantity] = useState("");
  const [mode, setMode] = useState<"air" | "ocean">("air"); // visual only, not sent to the API

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
  const estimated = result?.status === "estimated" ? result : null;

  // Numbers for the summary + bar
  const goods = Number(goodsValue) || 0;
  const freight = Number(shipping) || 0;
  const fees = Number(insurance) || 0;
  const duty = estimated?.dutyAmount ?? 0;
  const total = goods + freight + fees + duty;
  const qty = Number(quantity) || 0;
  const share = total > 0 ? (duty / total) * 100 : 0;

  const animTotal = useCountUp(total);
  const animShare = useCountUp(share);

  const segments = [
    { key: "goods", label: "Product value", short: "Goods", v: goods, color: C.goods },
    { key: "freight", label: "Freight & logistics", short: "Freight", v: freight, color: C.freight },
    { key: "duty", label: "Tariffs & import duty", short: "Duty", v: duty, color: C.duty },
    { key: "fees", label: "Insurance & fees", short: "Insurance", v: fees, color: C.fees },
  ];

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 pb-32 pt-8">
      <style>{`
        @keyframes te-flow { to { stroke-dashoffset: -20; } }
        @keyframes te-pop { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }
        .te-flow { animation: te-flow 1.2s linear infinite; }
        .te-pop { animation: te-pop .4s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .te-flow, .te-pop { animation: none; }
          .te-vehicle animateMotion { display: none; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Import duty estimator</h1>
          <p className="mt-1 text-xs text-neutral-500">
            A planning estimate of customs duty for an import. It is not added to quote totals or
            supplier rankings.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl bg-[#f5f6fa] shadow-sm">
          {/* summary */}
          <header className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-[#e6e8ef] px-6 py-5">
            <div className="min-w-[180px] flex-1">
              <Chip>Total estimated landed cost</Chip>
              <p className="mt-1 text-[28px] font-semibold leading-tight text-neutral-900">
                {total > 0 ? formatMoney(animTotal, currency) : "—"}
              </p>
            </div>
            <Stat label="Cost per unit" value={total > 0 && qty > 0 ? formatMoney(total / qty, currency) : "—"} />
            <Stat label="Tariff impact share" value={estimated ? `${animShare.toFixed(1)}%` : "—"} danger />
            <Stat label="HS classification" value={hsCode || "—"} />
          </header>

          {/* legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[#e6e8ef] px-6 py-3 text-xs text-neutral-700">
            {segments.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          {/* route + breakdown bar */}
          <section className="px-6 pb-6 pt-4">
            <RouteVisual
              origin={origin}
              destination={destination}
              mode={mode}
              dutyPercent={estimated ? Number(estimated.effectiveRatePercent) : null}
            />
            <p className="mb-1.5 mt-2 text-[11px] text-neutral-500">Landed cost structure breakdown (cumulative total)</p>
            <div className="flex h-[18px] overflow-hidden rounded-sm bg-[#e5e7eb]">
              {total > 0 &&
                segments.map((s) => (
                  <div
                    key={s.key}
                    title={`${s.label}: ${formatMoney(s.v, currency)}`}
                    className="transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${(s.v / total) * 100}%`, background: s.color }}
                  />
                ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-neutral-600">
              {segments.map((s) => (
                <span key={s.key}>
                  {s.short}: {formatMoney(s.v, currency)}
                </span>
              ))}
            </div>
          </section>

          {/* controls */}
          <section className="space-y-5 border-t border-[#e6e8ef] bg-[#f8f9fc] p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Origin country (supplier)">
                <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={fieldClass}>
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Destination country (you)">
                <select value={destination} onChange={(e) => setDestination(e.target.value)} className={fieldClass}>
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="HS code" hint="At least 4 digits, e.g. 8523 or 8523.51">
                <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="8523.51" className={fieldClass} />
              </Field>
              <Field label="Goods currency" hint="Duty is shown in this currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Goods value">
                <input type="number" min="0" step="0.01" value={goodsValue} onChange={(e) => setGoodsValue(e.target.value)} placeholder="0.00" className={fieldClass} />
              </Field>
              <Field label="Order quantity (optional)" hint="Used for cost per unit only">
                <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 1500" className={fieldClass} />
              </Field>
              <Field label="Shipping (optional)">
                <input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0.00" className={fieldClass} />
              </Field>
              <Field label="Insurance (optional)">
                <input type="number" min="0" step="0.01" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0.00" className={fieldClass} />
              </Field>
            </div>

            <div>
              <span className="mb-2 block text-[13px] text-neutral-700">Logistics shipping mode</span>
              <div className="flex rounded-full bg-[#eceff6] p-1" role="tablist">
                {([["air", "Air express"], ["ocean", "Ocean cargo"]] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={mode === k}
                    onClick={() => setMode(k)}
                    className={`h-9 flex-1 rounded-full text-[13px] transition ${
                      mode === k ? "bg-blue-600 text-white" : "text-neutral-600 hover:text-neutral-900"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">Changes the route graphic only. Enter real freight under Shipping.</p>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || estimate.isPending}
              className="h-11 w-full rounded-full bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              {estimate.isPending ? "Estimating…" : "Estimate duty"}
            </button>
          </section>
        </form>

        {estimate.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {(estimate.error as Error).message}
          </div>
        )}

        {result?.status === "domestic" && (
          <div className="rounded-2xl bg-[#f5f6fa] p-5 text-sm text-neutral-700">
            Origin and destination are the same country, so no import duty applies.
          </div>
        )}

        {result?.status === "prohibited" && (
          <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-medium text-red-800">This product can’t be imported on this route</p>
            <Restrictions items={result.restrictions} />
          </div>
        )}

        {result?.status === "not_estimated" && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="text-amber-800">
              <p className="text-sm font-medium">Duty not estimated</p>
              <p className="mt-1 text-xs">{result.reason}</p>
            </div>
            <Restrictions items={result.restrictions} />
          </div>
        )}

        {estimated && (
          <div className="space-y-4 rounded-3xl bg-[#f5f6fa] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <Chip>Estimated import duty</Chip>
                <p className="mt-1 text-2xl font-semibold text-neutral-900">{formatMoney(estimated.dutyAmount, currency)}</p>
              </div>
              <span className="rounded-full bg-[#e3e8f6] px-2.5 py-1 text-xs font-medium text-neutral-700">
                {estimated.effectiveRatePercent}% of goods value
              </span>
            </div>

            {!estimated.allVerified && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Includes rates that haven’t been checked against an official source yet. Confirm before relying on this.
              </p>
            )}

            {estimated.anyStale && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Some rates were last checked a while ago (more than 90 days for base duties, 30 for surcharges).
                Re-check them against the official source before relying on this.
              </p>
            )}

            <Restrictions items={estimated.restrictions} />

            <table className="w-full text-xs">
              <thead className="border-b border-[#e0e4ee] text-left text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">Measure</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">On value</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e8ef]">
                {estimated.components.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 text-neutral-800">
                      {c.name}
                      {!c.verified && <span className="ml-1.5 text-[10px] text-amber-700">unverified</span>}
                      {c.verified && (
                        <span className={`block text-[10px] ${c.stale ? "text-amber-700" : "text-neutral-400"}`}>
                          {c.stale ? "Check overdue. " : ""}Last checked {formatChecked(c.reviewedOn)}
                        </span>
                      )}
                      {c.mode === "top_up_to" && (
                        <span className="block text-[10px] text-neutral-400">Tops the standard duty up to {c.ratePercent}%</span>
                      )}
                      {c.sourceUrl && /^https?:\/\//.test(c.sourceUrl) && (
                        <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-neutral-400 underline">
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

            <ul className="list-disc space-y-1 border-t border-[#e6e8ef] pt-3 pl-4 text-[11px] text-neutral-500">
              {estimated.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}