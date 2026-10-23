"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProcurerUserMenu } from "../../components/ProcurerUserMenu";

// Pages shown before login. They have their own header, so we skip ours.
const PUBLIC_PATHS = [
  "/procurement/login",
  "/procurement/register",
  "/procurement/forgot-password",
];

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHeader = !PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  return (
    <>
      {showHeader && (
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-3">
            <Link
              href="/procurement/new"
              className="text-lg font-bold tracking-[0.2em] text-neutral-900"
            >
              METIS
            </Link>
            <ProcurerUserMenu />
          </div>
        </header>
      )}
      {children}
    </>
  );
}