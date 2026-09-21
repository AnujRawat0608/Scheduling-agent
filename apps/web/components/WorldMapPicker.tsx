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
  pickMode,
  showRisk,
}: {
  originCountry: string | null;
  destCountry: string | null;
  onSelectCountry: (mode: PickMode, countryName: string) => void;
  pickMode: PickMode;
  showRisk: boolean;
}) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoveredChokepoint, setHoveredChokepoint] = useState<ChokepointStatus | null>(null);

  const { data: chokepoints } = useQuery({
    queryKey: ["chokepoint-statuses"],
    queryFn: () => fetchChokepointStatuses(),
    refetchInterval: 60_000,
    enabled: showRisk,
  });

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
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

                let fill = "#a3a3a3";
                if (isOrigin) fill = "#3d6bff";
                else if (isDestination) fill = "#e11d48";
                else if (isHovered) fill = "#94a3b8";

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
          <span className="h-2.5 w-2.5 rounded-full bg-[#3d6bff]" />
          Low Risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
          Elevated Risk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Critical Risk
        </span>
      </div>
    </div>
  );
}