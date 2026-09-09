"use client";

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";

// Public, free-to-use topojson world map data — no API key needed.
const GEO_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";

type PickMode = "origin" | "destination";

type GeoProperties = {
  name: string;
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

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
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
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
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
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50">
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

                let fill = "#e5e5e5"; // neutral-200, default
                if (isOrigin) fill = "#3d6bff";
                else if (isDestination) fill = "#e11d48"; // rose-600
                else if (isHovered) fill = "#cbd5e1"; // slate-300 hover

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
        </ComposableMap>

        {hoveredCountry && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-white">
            {hoveredCountry}
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
      </div>
    </div>
  );
}