"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createProcurementTask } from "../../../lib/procurementApi";

export default function NewProcurementPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requesterName, setRequesterName] = useState("");

  const create = useMutation({
    mutationFn: createProcurementTask,
    onSuccess: (data) => router.push(`/procurement/${data.taskId}`),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ text, requesterEmail, requesterName: requesterName || undefined });
  }

  return (
    <main className="mx-auto max-w-lg p-8 space-y-6">
      <div>
        <h1 className="text-lg font-medium text-neutral-900">New procurement request</h1>
        <p className="mt-1 text-sm text-neutral-500">
          e.g. "We need 50 units of Raspberry Pi 5 for the hardware team by September 15"
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Your name</span>
          <input
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">Your email</span>
          <input
            required
            type="email"
            value={requesterEmail}
            onChange={(e) => setRequesterEmail(e.target.value)}
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
            placeholder="We need 50 units of Raspberry Pi 5 for the hardware team by September 15"
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
          {create.isPending ? "Sourcing…" : "Source it"}
        </button>
      </form>
    </main>
  );
}