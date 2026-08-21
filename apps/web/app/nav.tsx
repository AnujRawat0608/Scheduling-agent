"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Calendar } from "lucide-react";

export function Nav() {
  const pathname = usePathname();
  const isHistory = pathname === "/runs";

  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-8 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Calendar size={18} strokeWidth={2.5} />
          Scheduling Agent
        </Link>
        <Link
          href="/runs"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            isHistory
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          <Clock size={15} />
          History
        </Link>
      </div>
    </header>
  );
}