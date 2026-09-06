"use client";

import Link from "next/link";
import { Sparkles, ListChecks } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">
          What meeting do you need to set up?
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          It'll check calendars, propose times, and wait for your approval before sending anything.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/runs/new-ai"
          className="group flex flex-col gap-3 rounded-xl border border-neutral-200 p-6 transition hover:border-neutral-900 hover:shadow-sm"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-medium text-neutral-900">Describe it</div>
            <p className="mt-1 text-sm text-neutral-500">
              "30 min with sarah@co.com next week, avoid mornings"
            </p>
          </div>
        </Link>

        <Link
          href="/runs/new"
          className="group flex flex-col gap-3 rounded-xl border border-neutral-200 p-6 transition hover:border-neutral-900 hover:shadow-sm"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-neutral-700">
            <ListChecks size={18} />
          </div>
          <div>
            <div className="font-medium text-neutral-900">Fill out a form</div>
            <p className="mt-1 text-sm text-neutral-500">
              Title, attendees, and duration as separate fields.
            </p>
          </div>
        </Link>
      </div>
    </main>
  );
}
