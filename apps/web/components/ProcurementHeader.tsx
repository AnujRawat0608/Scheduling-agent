"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase } from "lucide-react";
import { ProcurerUserMenu } from "./ProcurerUserMenu";

// Pages that are shown before login and have their own header.
const PUBLIC_PATHS = [
  "/procurement/login",
  "/procurement/register",
  "/procurement/forgot-password",
];

export function ProcurementHeader() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <Link href="/procurement/new" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EA580C]/10 text-[#EA580C]">
            <Briefcase size={16} />
          </span>
          <span className="text-sm font-semibold text-neutral-900">Procurement portal</span>
        </Link>
        <ProcurerUserMenu />
      </div>
    </header>
  );
}