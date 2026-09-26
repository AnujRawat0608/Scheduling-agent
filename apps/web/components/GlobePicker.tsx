"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { feature } from "topojson-client";
import { geoCentroid } from "d3-geo";
import dynamic from "next/dynamic";
import { fetchChokepointStatuses, type ChokepointStatus } from "../lib/riskAgentApi";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const GEO_URL = "https://unpkg.com/world-atlas@2/countries-110m.json";

type PickMode = "origin" | "destination";

type CountryFeature = {
  type: "Feature";
  properties: { name: string };
  geometry: GeoJSON.Geometry;
};

const RISK_DOT_COLOR: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

// Approximate major global maritime trade lanes, as [lat, lng] waypoints
// that route through real chokepoints (Suez, Panama, Malacca, Hormuz, Cape
// of Good Hope) rather than cutting straight through land. This is a static
// reference set of shipping corridors — not live AIS vessel tracking.
const MAJOR_SHIPPING_ROUTES: { name: string; path: [number, number][] }[] = [
  {
    name: "Asia – Europe (Suez)",
    path: [
      [31.2, 121.5], // Shanghai
      [22.3, 114.2], // Hong Kong
      [1.3, 103.8], // Singapore
      [6.9, 79.8], // Colombo
      [12.8, 43.4], // Bab-el-Mandeb
      [29.9, 32.6], // Suez Canal
      [35.9, 14.5], // Malta
      [36.1, -5.3], // Gibraltar
      [51.9, 4.5], // Rotterdam
    ],
  },
  {
    name: "Trans-Pacific",
    path: [
      [31.2, 121.5], // Shanghai
      [35.4, 139.7], // Tokyo Bay
      [40, -170], // North Pacific
      [45, -140],
      [34.0, -118.2], // Los Angeles
    ],
  },
  {
    name: "Trans-Atlantic",
    path: [
      [51.9, 4.5], // Rotterdam
      [50.9, -1.4], // English Channel
      [45, -30], // Mid-Atlantic
      [40.7, -74.0], // New York
    ],
  },
  {
    name: "Asia – US East Coast (Panama)",
    path: [
      [22.3, 114.2], // Hong Kong
      [1.3, 103.8], // Singapore
      [10, -150], // Pacific crossing
      [8.4, -79.9], // Panama Canal (Pacific side)
      [9.4, -79.9], // Panama Canal (Atlantic side)
      [25.8, -80.2], // Miami
      [40.7, -74.0], // New York
    ],
  },
  {
    name: "Middle East – Asia (Hormuz)",
    path: [
      [29.4, 48.8], // Kuwait
      [26.2, 56.3], // Strait of Hormuz
      [20, 65],
      [6.9, 79.8], // Colombo
      [1.3, 103.8], // Singapore
    ],
  },
  {
    name: "Europe – Asia (Cape of Good Hope, alt. to Suez)",
    path: [
      [51.9, 4.5], // Rotterdam
      [36.1, -5.3], // Gibraltar
      [14.7, -17.4], // Dakar
      [-33.9, 18.4], // Cape Town
      [-20, 57], // Indian Ocean
      [6.9, 79.8], // Colombo
      [1.3, 103.8], // Singapore
    ],
  },
  {
    name: "Intra-Asia",
    path: [
      [31.2, 121.5], // Shanghai
      [22.3, 114.2], // Hong Kong
      [14.6, 120.9], // Manila
      [1.3, 103.8], // Singapore
    ],
  },
  {
    name: "South America – Europe",
    path: [
      [-23.9, -46.3], // Santos
      [-10, -30], // South Atlantic
      [14.7, -17.4], // Dakar
      [36.1, -5.3], // Gibraltar
      [51.9, 4.5], // Rotterdam
    ],
  },
  {
    name: "Australia – Asia",
    path: [
      [-33.9, 151.2], // Sydney
      [-10, 130], // Timor Sea
      [1.3, 103.8], // Singapore
    ],
  },
];

export default function GlobePicker({
  originCountry,
  destCountry,
  onSelectCountry,
  pickMode,
  showRisk,
  showShippingLanes = true,
}: {
  originCountry: string | null;
  destCountry: string | null;
  onSelectCountry: (mode: PickMode, countryName: string) => void;
  pickMode: PickMode;
  showRisk: boolean;
  showShippingLanes?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });

  const { data: chokepoints } = useQuery({
    queryKey: ["chokepoint-statuses"],
    queryFn: () => fetchChokepointStatuses(),
    refetchInterval: 60_000,
    enabled: showRisk,
  });

  useEffect(() => {
    fetch(GEO_URL)
      .then((res) => res.json())
      .then((topo) => {
        const geo = feature(topo, topo.objects.countries) as unknown as {
          features: CountryFeature[];
        };
        setCountries(geo.features);
      });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setSize({ width, height: Math.round(width * 0.62) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    const controls = globeRef.current.controls();
    controls.autoRotate = !originCountry && !destCountry;
    controls.autoRotateSpeed = 0.6;
  }, [originCountry, destCountry]);

  const originFeature = countries.find((c) => c.properties.name === originCountry);
  const destFeature = countries.find((c) => c.properties.name === destCountry);
  const originCoords = originFeature ? geoCentroid(originFeature as any) : undefined;
  const destCoords = destFeature ? geoCentroid(destFeature as any) : undefined;

  // The user's own origin -> destination route, drawn as a distinct solid
  // arc so it stands out from the background shipping-lane network.
  const routeArc =
    originCoords && destCoords
      ? [
          {
            startLat: originCoords[1],
            startLng: originCoords[0],
            endLat: destCoords[1],
            endLng: destCoords[0],
          },
        ]
      : [];

  const pointsData = showRisk
    ? (chokepoints ?? []).map((cp: ChokepointStatus) => ({
        lat: cp.lat,
        lng: cp.lon,
        color: RISK_DOT_COLOR[cp.status ?? ""] ?? "#9ca3af",
        name: cp.name,
        status: cp.status,
      }))
    : [];

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50"
      >
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          polygonsData={countries}
          polygonCapColor={(d: any) => {
            const name = d.properties.name;
            if (name === originCountry) return "#3d6bff";
            if (name === destCountry) return "#e11d48";
            if (name === hoveredCountry) return "#94a3b8";
            return "rgba(163,163,163,0.35)";
          }}
          polygonSideColor={() => "rgba(0,0,0,0.15)"}
          polygonStrokeColor={() => "#fff"}
          polygonAltitude={(d: any) =>
            d.properties.name === originCountry || d.properties.name === destCountry ? 0.02 : 0.006
          }
          polygonLabel={(d: any) => d.properties.name}
          onPolygonHover={(d: any) => setHoveredCountry(d ? d.properties.name : null)}
          onPolygonClick={(d: any) => onSelectCountry(pickMode, d.properties.name)}
          // Background network of real-world shipping lanes.
          pathsData={showShippingLanes ? MAJOR_SHIPPING_ROUTES : []}
          pathPoints="path"
          pathPointLat={(p: [number, number]) => p[0]}
          pathPointLng={(p: [number, number]) => p[1]}
          pathColor={(d: any) =>
            d.name === hoveredLane ? "rgba(61,107,255,0.9)" : "rgba(56,189,248,0.45)"
          }
          pathStroke={(d: any) => (d.name === hoveredLane ? 1.2 : 0.6)}
          pathDashLength={0.15}
          pathDashGap={0.06}
          pathDashAnimateTime={8000}
          pathLabel={(d: any) => d.name}
          onPathHover={(d: any) => setHoveredLane(d ? d.name : null)}
          // The user's selected origin -> destination, on top of the network.
          arcsData={routeArc}
          arcColor={() => "#3d6bff"}
          arcDashLength={0.4}
          arcDashGap={0.2}
          arcDashAnimateTime={2000}
          arcStroke={0.7}
          pointsData={pointsData}
          pointColor="color"
          pointAltitude={0.01}
          pointRadius={0.35}
          pointLabel={(d: any) => `${d.name} — ${d.status ?? "unknown"} risk`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#3d6bff]" />
          Your Route
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-sky-400" />
          Major Shipping Lane
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