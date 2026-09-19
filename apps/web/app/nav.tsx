"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock } from "lucide-react";

export function Nav() {
  const pathname = usePathname();
  const isHistory = pathname === "/runs";

  // Metis homepage has its own design and CTAs — don't render this nav there.
  if (pathname === "/") {
    return null;
  }

  return (
    <header className="border-b border-neutral-200">
      <div className="flex items-center gap-1.5 px-8 py-4">
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

        <Link
          href="/procurement"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            pathname?.startsWith("/procurement")
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Procurement
        </Link>

        <Link
          href="/supply-chain"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            pathname?.startsWith("/supply-chain")
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Supply Chain
        </Link>

        <Link
          href="/suppliers"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            pathname?.startsWith("/suppliers")
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Suppliers
        </Link>

        <Link
          href="/routing"
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            pathname?.startsWith("/routing")
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Routing
        </Link>
      </div>
    </header>
  );
}