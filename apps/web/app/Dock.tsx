"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Clock,
  Truck,
  Mail,
  Route,
  Boxes,
  Receipt,
} from "lucide-react";

type DockApp = {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  isActive: (pathname: string | null) => boolean;
};

const apps: DockApp[] = [
  {
    id: "scheduling",
    label: "Scheduling Agent",
    icon: <Calendar size={20} strokeWidth={2} />,
    href: "/",
    isActive: (p) => p === "/",
  },
  {
    id: "history",
    label: "History",
    icon: <Clock size={20} strokeWidth={2} />,
    href: "/runs",
    isActive: (p) => p === "/runs",
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: <Truck size={20} strokeWidth={2} />,
    href: "/procurement/new",
    isActive: (p) => !!p?.startsWith("/procurement"),
  },
  {
    id: "supply-chain",
    label: "Supply Chain",
    icon: <Boxes size={20} strokeWidth={2} />,
    href: "/supply-chain",
    isActive: (p) => !!p?.startsWith("/supply-chain"),
  },
  {
    id: "mail",
    label: "Mail",
    icon: <Mail size={20} strokeWidth={2} />,
    href: "/mail",
    isActive: (p) => !!p?.startsWith("/mail"),
  },
  {
    id: "routing",
    label: "Routing",
    icon: <Route size={20} strokeWidth={2} />,
    href: "/routing",
    isActive: (p) => !!p?.startsWith("/routing"),
  },
  {
    id: "billing",
    label: "Billing",
    icon: <Receipt size={20} strokeWidth={2} />,
    href: "/billing",
    isActive: (p) => !!p?.startsWith("/billing"),
  },
];

// How much a neighbouring icon grows, falling off with distance from the
// hovered icon — this is what gives a real dock its "wave" feel.
function scaleFor(index: number, hovered: number | null) {
  if (hovered === null) return 1;
  const distance = Math.abs(index - hovered);
  if (distance === 0) return 1.5;
  if (distance === 1) return 1.22;
  if (distance === 2) return 1.06;
  return 1;
}

export function Dock() {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<number | null>(null);

  // Match the Nav's own convention: no dock on the Metis marketing homepage.
  //if (pathname === "/") {
   // return null;
  //}

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30">
      <div
        onMouseLeave={() => setHovered(null)}
        className="flex items-end gap-2 rounded-[24px] border border-neutral-200 bg-white/80 backdrop-blur-xl px-3 py-2.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.15)]"
      >
        {apps.map((app, i) => {
          const scale = scaleFor(i, hovered);
          const active = app.isActive(pathname);
          return (
            <Link
              key={app.id}
              href={app.href}
              onMouseEnter={() => setHovered(i)}
              className="relative flex flex-col items-center"
              style={{ transformOrigin: "bottom center" }}
            >
              {/* Tooltip */}
              <span
                className={`absolute -top-9 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white shadow-md transition-all duration-150 ${
                  hovered === i
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-1 pointer-events-none"
                }`}
              >
                {app.label}
              </span>

              {/* Icon tile */}
              <div
                className={`flex items-center justify-center h-11 w-11 rounded-[13px] border transition-all duration-150 ease-out ${
                  active
                    ? "bg-[#3d6bff] border-[#3d6bff] text-white shadow-[0_6px_16px_-2px_rgba(61,107,255,0.55)]"
                    : "bg-[#eef2ff] border-[#dbe3ff] text-[#3d6bff] shadow-[0_4px_10px_-2px_rgba(61,107,255,0.25)]"
                }`}
                style={{ transform: `scale(${scale})` }}
              >
                {app.icon}
              </div>

              {/* Active dot */}
              <span
                className={`mt-1 h-1 w-1 rounded-full bg-[#3d6bff] transition-opacity duration-150 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}