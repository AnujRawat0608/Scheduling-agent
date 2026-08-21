"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createRunFromText } from "../../../lib/api";

export default function NewRunFromTextPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");

  const create = useMutation({
    mutationFn: createRunFromText,
    onSuccess: (data) => router.push(`/runs/${data.runId}`),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ text, organizerEmail });
  }

  return (
    <main className="mx-auto max-w-lg p-8 space-y-6">
      <div>
        <h1 className="text-lg font-medium text-neutral-900">
          Describe the meeting
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          e.g. "30 min with sarah@company.com sometime next week, avoid mornings"
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">
            Your email (organizer — must be connected via /auth/google)
          </span>
          <input
            required
            type="email"
            value={organizerEmail}
            onChange={(e) => setOrganizerEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Request</span>
          <textarea
            required
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="30 min with sarah@company.com and priya@company.com next week, no mornings"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        {create.isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {(create.error as Error).message}
          </div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {create.isPending ? "Understanding request…" : "Schedule it"}
        </button>
      </form>
    </main>
  );
}