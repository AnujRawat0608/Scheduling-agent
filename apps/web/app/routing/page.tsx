"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, Plane, Ship, Truck, Check, AlertTriangle, Radio } from "lucide-react";
import WorldMapPicker from "../../components/WorldMapPicker";
import { assessRouteRisk } from "../../lib/riskApi";

type Method = "air" | "sea" | "road";
type PickMode = "origin" | "destination";

type ShippingQuote = {
  method: Method;
  label: string;
  icon: React.ReactNode;
  costPerKg: number;
  baseCost: number;
  transitDays: number;
};

const METHOD_PROFILES: ShippingQuote[] = [
  { method: "air", label: "Air Freight", icon: <Plane size={14} />, costPerKg: 45, baseCost: 2000, transitDays: 2 },
  { method: "sea", label: "Sea Freight", icon: <Ship size={14} />, costPerKg: 4, baseCost: 500, transitDays: 18 },
  { method: "road", label: "Road Freight", icon: <Truck size={14} />, costPerKg: 14, baseCost: 800, transitDays: 6 },
];

type ComparedOption = ShippingQuote & {
  totalCost: number;
  arrivalDate: Date;
  meetsDeadline: boolean;
};

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function deriveRegion(freeText: string, mapCountry: string | null) {
  if (mapCountry) return mapCountry;
  const parts = freeText.split(",");
  return parts[parts.length - 1]?.trim() ?? "";
}

export default function RoutingPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [deadline, setDeadline] = useState("");

  const [results, setResults] = useState<ComparedOption[] | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Method | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  const [originCountry, setOriginCountry] = useState<string | null>(null);
  const [destCountry, setDestCountry] = useState<string | null>(null);

  // Map controls — lifted up so the buttons can sit above the map card,
  // matching the reference layout, while WorldMapPicker stays presentational.
  const [pickMode, setPickMode] = useState<PickMode>("origin");
  const [showRisk, setShowRisk] = useState(true);

  function handleMapSelect(mode: "origin" | "destination", countryName: string) {
    if (mode === "origin") {
      setOriginCountry(countryName);
    } else {
      setDestCountry(countryName);
    }
  }

  const supplierRegion = deriveRegion(origin, originCountry);
  const destRegion = deriveRegion(destination, destCountry);

  const { data: riskAssessment, isLoading: isLoadingRisk } = useQuery({
    queryKey: ["route-risk", supplierRegion, destRegion],
    queryFn: () => assessRouteRisk(supplierRegion, destRegion),
    enabled: hasCompared && Boolean(supplierRegion),
  });

  function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    const weight = Number(weightKg);
    if (!weight || !origin || !destination) return;

    const deadlineDate = deadline ? new Date(deadline) : null;
    const today = new Date();

    const computed: ComparedOption[] = METHOD_PROFILES.map((profile) => {
      const totalCost = Math.round(profile.baseCost + profile.costPerKg * weight);
      const arrivalDate = new Date(today);
      arrivalDate.setDate(arrivalDate.getDate() + profile.transitDays);
      const meetsDeadline = deadlineDate ? arrivalDate <= deadlineDate : true;
      return { ...profile, totalCost, arrivalDate, meetsDeadline };
    });

    setResults(computed);
    setSelectedMethod(null);
    setHasCompared(true);
  }

  const recommendedMethod = useMemo(() => {
    if (!results) return null;

    const withRisk = results.map((r) =>
      r.method === "sea" && riskAssessment?.known_route
        ? { ...r, riskStatus: riskAssessment.overall_status }
        : r
    );

    const viable = withRisk.filter((r) => {
      if (r.method === "sea" && (r as any).riskStatus === "red") return false;
      return true;
    });

    const eligible = viable.filter((r) => r.meetsDeadline);
    const pool = eligible.length > 0 ? eligible : viable.length > 0 ? viable : withRisk;

    const scored = pool.map((r) => ({
      ...r,
      adjustedCost: r.method === "sea" && (r as any).riskStatus === "yellow" ? r.totalCost * 1.1 : r.totalCost,
    }));

    return scored.reduce((best, r) => (r.adjustedCost < best.adjustedCost ? r : best)).method;
  }, [results, riskAssessment]);

  const displayedMethod = selectedMethod ?? recommendedMethod;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Routing</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Compare Air, Sea, and Road freight for a shipment and see which one actually fits your deadline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Left: dark route summary panel */}
        <div className="rounded-2xl bg-[#0f1b3d] p-6 text-white space-y-5">
          <h2 className="text-base font-semibold">Route Summary</h2>

          <form onSubmit={handleCompare} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs text-white/60">Origin</span>
              <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b82ff]" />
                <input
                  required
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Shenzhen, China"
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#5b82ff]"
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-white/60">Destination</span>
              <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400" />
                <input
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Pune, India"
                  className="w-full rounded-lg border border-rose-400/40 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-rose-400"
                />
              </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-white/60">Weight</span>
                <input
                  required
                  type="number"
                  min="0"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="120 kg"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#5b82ff]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-white/60">Needed By</span>
                <div className="relative">
                  <Calendar size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-8 pr-2 text-sm text-white outline-none focus:border-[#5b82ff] [color-scheme:dark]"
                  />
                </div>
              </label>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
            >
              Compare Methods
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
            <button
              type="button"
              onClick={() => setShowRisk((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                showRisk
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <Radio size={13} />
              Show/Hide Route Risk
            </button>
          </div>

          <WorldMapPicker
            originCountry={originCountry}
            destCountry={destCountry}
            onSelectCountry={handleMapSelect}
            pickMode={pickMode}
            showRisk={showRisk}
          />
        </div>
      </div>

      {/* Comparison table */}
      {results && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-sm font-medium text-neutral-700">
              {origin} → {destination} · {weightKg}kg
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-neutral-500">Method</th>
                  {results.map((r) => (
                    <th key={r.method} className="px-6 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                        {r.icon}
                        {r.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                <tr>
                  <td className="px-6 py-3 text-xs font-medium text-neutral-500">ETA</td>
                  {results.map((r) => (
                    <td key={r.method} className="px-6 py-3 text-neutral-700">
                      {r.transitDays}-{r.transitDays + (r.method === "sea" ? 12 : r.method === "road" ? 6 : 3)} Days
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-6 py-3 text-xs font-medium text-neutral-500">Cost</td>
                  {results.map((r) => (
                    <td key={r.method} className="px-6 py-3 font-medium text-neutral-900">
                      {formatINR(r.totalCost)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-6 py-3 text-xs font-medium text-neutral-500">Risk</td>
                  {results.map((r) => {
                    const risk =
                      r.method === "sea" && riskAssessment?.known_route
                        ? riskAssessment.overall_status
                        : null;
                    return (
                      <td key={r.method} className="px-6 py-3">
                        {r.method === "sea" ? (
                          isLoadingRisk ? (
                            <span className="text-xs text-neutral-400">checking…</span>
                          ) : risk ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                risk === "red"
                                  ? "bg-red-100 text-red-700"
                                  : risk === "yellow"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {risk === "red" && <AlertTriangle size={10} />}
                              {risk}
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )
                        ) : (
                          <span className="text-neutral-600">Low</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Method selector + recommendation, kept from the original flow */}
          <div className="divide-y divide-neutral-100 border-t border-neutral-200">
            {results.map((option) => {
              const isSelected = displayedMethod === option.method;
              const isRecommended = recommendedMethod === option.method;
              return (
                <button
                  key={option.method}
                  onClick={() => setSelectedMethod(option.method)}
                  className={`flex w-full items-center justify-between px-6 py-3 text-left transition ${
                    isSelected ? "bg-[#eef2ff]" : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedMethod(option.method)}
                      className="accent-[#3d6bff]"
                    />
                    <span className="text-sm text-neutral-800">{option.label}</span>
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <Check size={10} strokeWidth={3} />
                        Recommended
                      </span>
                    )}
                    {!option.meetsDeadline && deadline && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Misses deadline
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    Arrives {option.arrivalDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                </button>
              );
            })}
          </div>

          {riskAssessment?.known_route && (
            <div
              className={`px-6 py-4 border-t text-sm ${
                riskAssessment.overall_status === "red"
                  ? "bg-red-50 border-red-100 text-red-800"
                  : riskAssessment.overall_status === "yellow"
                  ? "bg-amber-50 border-amber-100 text-amber-800"
                  : "bg-green-50 border-green-100 text-green-800"
              }`}
            >
              <p className="font-medium mb-1">Geopolitical route risk — sea freight</p>
              <p>{riskAssessment.recommendation}</p>
              {riskAssessment.chokepoints.length > 0 && (
                <p className="mt-1.5 text-xs opacity-80">
                  Affected chokepoints:{" "}
                  {riskAssessment.chokepoints.map((c) => `${c.name} (${c.status ?? "unknown"})`).join(", ")}
                </p>
              )}
            </div>
          )}

          {displayedMethod && (
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
              <span className="text-sm text-neutral-600">
                Selected:{" "}
                <span className="font-medium text-neutral-900">
                  {results.find((r) => r.method === displayedMethod)?.label}
                </span>
              </span>
              <button className="rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90">
                Book this shipment
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}