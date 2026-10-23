"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Building2, ChevronDown } from "lucide-react";
import {
  fetchCurrentProcurer,
  logoutProcurer,
  hasProcurerToken,
} from "../lib/procurerAuthApi";

export function ProcurerUserMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // localStorage only exists in the browser, so wait for mount to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

const { data: procurer, isLoading } = useQuery({
  queryKey: ["procurer", "me"],
  queryFn: fetchCurrentProcurer,
  enabled: mounted && hasProcurerToken(),
  staleTime: 5 * 60 * 1000,
  retry: false,
});

// Token present but rejected by the server (expired) -> send to login.
useEffect(() => {
  if (mounted && hasProcurerToken() === false) return;
  if (mounted && !isLoading && procurer === null) {
    router.replace("/procurement/login");
  }
}, [mounted, isLoading, procurer, router]);

  // Close on outside click or Escape.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!mounted || !hasProcurerToken()) return null;

  const displayName = procurer?.contactName || procurer?.companyName || procurer?.email || "";
  const initial = displayName.charAt(0).toUpperCase() || "?";

  async function handleLogout() {
    await logoutProcurer();
    qc.clear(); // don't leave the previous buyer's cached data around
    router.replace("/procurement/login");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-1 pl-1 pr-2 shadow-sm transition hover:border-neutral-300"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EA580C] text-xs font-semibold text-white">
          {isLoading ? "…" : initial}
        </span>
        <ChevronDown size={14} className="text-neutral-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
        >
          <div className="space-y-1 border-b border-neutral-100 px-3.5 py-3">
            {procurer?.contactName && (
              <p className="truncate text-xs font-semibold text-neutral-900">
                {procurer.contactName}
              </p>
            )}
            <p className="truncate text-[11px] text-neutral-500">{procurer?.email}</p>
            {procurer?.companyName && (
              <p className="flex items-center gap-1.5 truncate text-[11px] text-neutral-500">
                <Building2 size={12} className="shrink-0 text-neutral-400" />
                {procurer.companyName}
              </p>
            )}
          </div>
          <button
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}