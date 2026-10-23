"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Providers } from "./providers";
import { Dock } from "./Dock";
import { ProcurerUserMenu } from "../components/ProcurerUserMenu";
import { Analytics } from "@vercel/analytics/next";

// Pages that get the METIS bar. To add a new page, add its path here.
const SHOW_ON = ["/procurement", "/catalog", "/supply-chain", "/suppliers"];

// Pages inside those sections that must NOT get the bar (they have their own header).
const HIDE_ON = [
  "/procurement/login",
  "/procurement/register",
  "/procurement/forgot-password",
  "/suppliers/login",
  "/suppliers/register",
  "/suppliers/forgot-password",
];

// Sections that belong to buyers. Only these get the buyer's profile menu.
const BUYER_SECTIONS = ["/procurement", "/catalog"];

function AppHeader() {
  const pathname = usePathname();

  const show =
    SHOW_ON.some((p) => pathname === p || pathname.startsWith(p + "/")) &&
    !HIDE_ON.some((p) => pathname.startsWith(p));

  if (!show) return null;

  const isBuyerPage = BUYER_SECTIONS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3">
        <Link
          href={isBuyerPage ? "/procurement/new" : "/supply-chain"}
          className="text-lg font-bold tracking-[0.2em] text-neutral-900"
        >
          METIS
        </Link>
        {/* Supplier pages get their own menu later; no buyer profile on them. */}
        {isBuyerPage && (
  <div className="flex items-center gap-4">
    <Link
      href="/procurement"
      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
    >
      My orders &amp; quotes
    </Link>
    <ProcurerUserMenu />
  </div>
)}
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppHeader />
          <main className="pb-28">{children}</main>
          <Dock />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}