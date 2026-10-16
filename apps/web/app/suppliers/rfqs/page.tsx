"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RfqInbox } from "../../../components/RfqInbox";

export default function SupplierRfqsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Requests for quote
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Quote on buyer requests before the reply-by date.
            </p>
          </div>
          <Link
            href="/suppliers/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
          >
            <ArrowLeft size={13} />
            Dashboard
          </Link>
        </div>

        <RfqInbox showTabs />
      </div>
    </main>
  );
}