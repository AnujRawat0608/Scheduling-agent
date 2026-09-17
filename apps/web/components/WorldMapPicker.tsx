"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { fetchChokepointStatuses, type ChokepointStatus } from "../lib/riskAgentApi";

// Public, free-to-use topojson world map data — no API key needed.
const GEO_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";

type PickMode = "origin" | "destination";

type GeoProperties = {
  name: string;
};

const RISK_DOT_COLOR: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

export default function WorldMapPicker({
  originCountry,
  destCountry,
  onSelectCountry,
}: {
  originCountry: string | null;
  destCountry: string | null;
  onSelectCountry: (mode: PickMode, countryName: string) => void;
}) {
  const [pickMode, setPickMode] = useState<PickMode>("origin");
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [showRisk, setShowRisk] = useState(true);
  const [hoveredChokepoint, setHoveredChokepoint] = useState<ChokepointStatus | null>(null);

  const { data: chokepoints } = useQuery({
    queryKey: ["chokepoint-statuses"],
    queryFn: () => fetchChokepointStatuses(),
    refetchInterval: 60_000,
    enabled: showRisk,
  });

  return (
    <div className="rounded-2xl border border-neutral-300 bg-white p-6 space-y-4 shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-700">Pick lanes on the map</h2>
          <p className="mt-0.5 text-xs text-neutral-400">
            Choose whether you're setting the origin or destination, then click a country.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPickMode("origin")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              pickMode === "origin"
                ? "bg-[#3d6bff] text-white"
                : "border border-neutral-300 text-neutral-600 hover:border-neutral-400"
            }`}
          >
            Set Origin
          </button>
          <button
            type="button"
            onClick={() => setPickMode("destination")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              pickMode === "destination"
                ? "bg-rose-600 text-white"
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
            }`}
          >
            Set Destination
          </button>
          <button
            type="button"
            onClick={() => setShowRisk((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              showRisk
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
            }`}
          >
            {showRisk ? "Hide route risk" : "Show route risk"}
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100">
        <ComposableMap
          projectionConfig={{ scale: 140 }}
          style={{ width: "100%", height: "auto" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const props = geo.properties as GeoProperties;
                const name = props.name;
                const isOrigin = name === originCountry;
                const isDestination = name === destCountry;
                const isHovered = name === hoveredCountry;

                let fill = "#a3a3a3"; // neutral-400, default
                if (isOrigin) fill = "#3d6bff";
                else if (isDestination) fill = "#e11d48"; // rose-600
                else if (isHovered) fill = "#94a3b8"; // slate-400 hover

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setHoveredCountry(name)}
                    onMouseLeave={() => setHoveredCountry(null)}
                    onClick={() => onSelectCountry(pickMode, name)}
                    style={{
                      fill,
                      stroke: "#fff",
                      strokeWidth: 0.5,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  />
                );
              })
            }
          </Geographies>

          {showRisk &&
            chokepoints?.map((cp) => (
              <Marker
                key={cp.id}
                coordinates={[cp.lon, cp.lat]}
                onMouseEnter={() => setHoveredChokepoint(cp)}
                onMouseLeave={() => setHoveredChokepoint(null)}
              >
                <circle
                  r={5}
                  fill={RISK_DOT_COLOR[cp.status ?? ""] ?? "#9ca3af"}
                  stroke="#fff"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                />
              </Marker>
            ))}
        </ComposableMap>

        {hoveredCountry && !hoveredChokepoint && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-white">
            {hoveredCountry}
          </div>
        )}

        {hoveredChokepoint && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-neutral-900/90 px-2 py-1.5 text-xs text-white">
            <div className="font-medium">{hoveredChokepoint.name}</div>
            <div className="capitalize text-neutral-300">
              {hoveredChokepoint.status ?? "unknown"} risk
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#3d6bff]" />
          Origin{originCountry ? `: ${originCountry}` : " (none selected)"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" />
          Destination{destCountry ? `: ${destCountry}` : " (none selected)"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-neutral-200" />
          Unselected
        </span>
        {showRisk && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Low risk
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              Elevated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Critical
            </span>
          </>
        )}
      </div>
    </div>
  );
}