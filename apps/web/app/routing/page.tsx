"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Plane, Ship, Truck, TrainFront, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import WorldMapPicker from "../../components/WorldMapPicker";
import GlobePicker from "../../components/GlobePicker";
import { assessRouteRisk, type RouteRiskResponse, type ModeAssessment, type RiskStatus } from "../../lib/riskApi";

type PickMode = "origin" | "destination";

const MODE_META: Record<string, { label: string; icon: ReactNode }> = {
  sea: { label: "Sea Freight", icon: <Ship size={16} /> },
  air: { label: "Air Freight", icon: <Plane size={16} /> },
  road: { label: "Road Freight", icon: <Truck size={16} /> },
  rail: { label: "Rail Freight", icon: <TrainFront size={16} /> },
};

const STATUS_STYLES: Record<RiskStatus, string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  unknown: "bg-neutral-100 text-neutral-500",
};

export default function RoutingPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originCountry, setOriginCountry] = useState<string | null>(null);
  const [destCountry, setDestCountry] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("origin");
  const [submitted, setSubmitted] = useState(false);

  // A country picked on the map is clean and unambiguous; prefer it over
  // free-typed text, since the risk API matches against country names, not
  // arbitrary strings like "Shenzhen, China".
  const effectiveOrigin = originCountry ?? origin.trim();
  const effectiveDestination = destCountry ?? destination.trim();

  function handleMapSelect(mode: PickMode, countryName: string) {
    if (mode === "origin") setOriginCountry(countryName);
    else setDestCountry(countryName);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!effectiveOrigin || !effectiveDestination) return;
    setSubmitted(true);
  }

  const {
    data: risk,
    isLoading,
    isError,
  } = useQuery<RouteRiskResponse>({
    queryKey: ["route-risk", effectiveOrigin, effectiveDestination],
    queryFn: () => assessRouteRisk(effectiveOrigin, effectiveDestination),
    enabled: submitted && Boolean(effectiveOrigin) && Boolean(effectiveDestination),
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Route Risk</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Enter an origin and destination to see current geopolitical and logistical risk across every freight mode.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
  {/* Left: input panel */}
  <div className="rounded-2xl bg-white border border-neutral-200 p-6 space-y-5">
    <h2 className="text-base font-semibold text-neutral-900">Origin &amp; Destination</h2>

    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Origin country</span>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3d6bff]" />
          <input
            required
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setOriginCountry(null); // typing overrides a prior map pick
              setSubmitted(false);
            }}
            placeholder="Supplier's Country"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/20"
          />
        </div>
        {originCountry && (
          <span className="text-xs text-[#3d6bff]">Using map selection: {originCountry}</span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Destination country</span>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3d6bff]" />
          <input
            required
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              setDestCountry(null);
              setSubmitted(false);
            }}
            placeholder="Procurer's Country"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2.5 pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/20"
          />
        </div>
        {destCountry && <span className="text-xs text-[#3d6bff]">Using map selection: {destCountry}</span>}
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
      >
        Check Route Risk
      </button>
    </form>
  </div>

        {/* Right: map controls + map */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPickMode("origin")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                pickMode === "origin"
                  ? "bg-[#3d6bff] text-white"
                  : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <MapPin size={13} />
              Set Origin
            </button>
            <button
              type="button"
              onClick={() => setPickMode("destination")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                pickMode === "destination"
                  ? "bg-rose-600 text-white"
                  : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <MapPin size={13} />
              Set Destination
            </button>
          </div>

          <WorldMapPicker
  originCountry={effectiveOrigin || null}
  destCountry={effectiveDestination || null}
  onSelectCountry={handleMapSelect}
  pickMode={pickMode}
  showRisk={false}
/>
        </div>
      </div>

      {/* Results */}
      {submitted && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-sm font-medium text-neutral-700">
              {effectiveOrigin} → {effectiveDestination}
            </h2>
          </div>

          {isLoading && <div className="px-6 py-8 text-sm text-neutral-400">Checking current risk…</div>}

          {isError && (
            <div className="px-6 py-8 text-sm text-red-600">
              Couldn&apos;t retrieve risk data right now. Try again in a moment.
            </div>
          )}

          {risk && (
            <>
              <div className="divide-y divide-neutral-100">
                {risk.modes.map((m) => (
                  <ModeRow key={m.mode} assessment={m} />
                ))}
              </div>

              <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 text-xs text-neutral-500">
                {risk.disclaimer}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function ModeRow({ assessment }: { assessment: ModeAssessment }) {
  const meta = MODE_META[assessment.mode] ?? { label: assessment.mode, icon: <HelpCircle size={16} /> };

  if (!assessment.viable) {
    return (
      <div className="px-6 py-4 flex items-start gap-3 opacity-50">
        <span className="mt-0.5">{meta.icon}</span>
        <div>
          <p className="text-sm font-medium text-neutral-700">{meta.label}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Not viable — {assessment.reason ?? "not applicable for this lane."}
          </p>
        </div>
      </div>
    );
  }

  const status = assessment.status ?? "unknown";
  const chokepoints = assessment.chokepoints ?? [];
  const drivingEvents = assessment.driving_events ?? [];

  return (
    <div className="px-6 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-neutral-700">{meta.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-neutral-900">{meta.label}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
            >
              {status === "red" && <AlertTriangle size={10} />}
              {status === "green" && <CheckCircle2 size={10} />}
              {status}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">{assessment.summary ?? "No summary available."}</p>

          {chokepoints.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chokepoints.map((c) => (
                <span
                  key={c.name}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[c.status]}`}
                >
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {drivingEvents.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600">
                {drivingEvents.length} contributing event{drivingEvents.length > 1 ? "s" : ""}
              </summary>
              <ul className="mt-1.5 space-y-1">
                {drivingEvents.map((ev, i) => (
                  <li key={i} className="text-xs text-neutral-500">
                    {ev.headline} <span className="text-neutral-400">— {ev.chokepoint_name}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}