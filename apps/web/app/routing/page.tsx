"use client";

import { useState } from "react";
import { Route, Plane, Ship, Truck, Check } from "lucide-react";

type Method = "air" | "sea" | "road";

type ShippingQuote = {
  method: Method;
  label: string;
  icon: React.ReactNode;
  costPerKg: number;
  baseCost: number;
  transitDays: number;
};

// Mock per-method rate model. Swap for real carrier rates (or a
// lanes catalog, similar to Supply Chain) once available.
const METHOD_PROFILES: ShippingQuote[] = [
  { method: "air", label: "Air Freight", icon: <Plane size={16} />, costPerKg: 45, baseCost: 2000, transitDays: 2 },
  { method: "road", label: "Road Freight", icon: <Truck size={16} />, costPerKg: 14, baseCost: 800, transitDays: 6 },
  { method: "sea", label: "Sea Freight", icon: <Ship size={16} />, costPerKg: 4, baseCost: 500, transitDays: 18 },
];

type ComparedOption = ShippingQuote & {
  totalCost: number;
  arrivalDate: Date;
  meetsDeadline: boolean;
};

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function RoutingPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [deadline, setDeadline] = useState("");

  const [results, setResults] = useState<ComparedOption[] | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<Method | null>(null);

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

    // Recommend the cheapest option that meets the deadline; if none do,
    // recommend the fastest one instead.
    const eligible = computed.filter((c) => c.meetsDeadline);
    const recommended =
      eligible.length > 0
        ? eligible.reduce((best, c) => (c.totalCost < best.totalCost ? c : best))
        : computed.reduce((fastest, c) => (c.transitDays < fastest.transitDays ? c : fastest));

    setResults(computed);
    setSelectedMethod(recommended.method);
  }

  const recommendedMethod = results
    ? (() => {
        const eligible = results.filter((r) => r.meetsDeadline);
        const pool = eligible.length > 0 ? eligible : results;
        return pool.reduce((best, r) =>
          eligible.length > 0
            ? r.totalCost < best.totalCost
              ? r
              : best
            : r.transitDays < best.transitDays
              ? r
              : best
        ).method;
      })()
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <div className="flex items-center gap-2">
        <Route size={22} className="text-[#3d6bff]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Routing</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Compare Air, Sea, and Road freight for a shipment and see which one actually fits your deadline.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleCompare}
        className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Origin</span>
          <input
            required
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Shenzhen, China"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Destination</span>
          <input
            required
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Pune, India"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Weight (kg)</span>
          <input
            required
            type="number"
            min="0"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="120"
            className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Needed by (optional)</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        <button
          type="submit"
          className="col-span-2 rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
        >
          Compare shipping methods
        </button>
      </form>

      {results && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-sm font-medium text-neutral-700">
              {origin} → {destination} · {weightKg}kg
            </h2>
          </div>

          <div className="divide-y divide-neutral-100">
            {results.map((option) => {
              const isSelected = selectedMethod === option.method;
              const isRecommended = recommendedMethod === option.method;
              return (
                <button
                  key={option.method}
                  onClick={() => setSelectedMethod(option.method)}
                  className={`flex w-full items-center justify-between px-6 py-4 text-left transition ${
                    isSelected ? "bg-[#eef2ff]" : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedMethod(option.method)}
                      className="accent-[#3d6bff]"
                    />
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3d6bff]">
                      {option.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900">{option.label}</span>
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
                      <div className="text-xs text-neutral-400 mt-0.5">
                        Arrives {option.arrivalDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    <div className="text-sm font-medium text-neutral-900">{formatINR(option.totalCost)}</div>
                    <div className="text-xs text-neutral-400">{option.transitDays}d transit</div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedMethod && (
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
              <span className="text-sm text-neutral-600">
                Selected: <span className="font-medium text-neutral-900">
                  {results.find((r) => r.method === selectedMethod)?.label}
                </span>
              </span>
              <button
                className="rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
              >
                Book this shipment
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}