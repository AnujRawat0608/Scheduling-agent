"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { createRun } from "../../../lib/api";

export default function NewRunPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [attendeeEmails, setAttendeeEmails] = useState("");
  const [duration, setDuration] = useState(30);

  const create = useMutation({
    mutationFn: createRun,
    onSuccess: (data) => router.push(`/runs/${data.runId}`),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const attendees = attendeeEmails
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email, i) => ({ id: String(i + 2), email }));

    create.mutate({
      title,
      durationMinutes: duration,
      organizer: { id: "1", email: organizerEmail },
      attendees,
    });
  }

  return (
    <main className="mx-auto max-w-lg p-8 space-y-6">
      <h1 className="text-lg font-medium text-neutral-900">New scheduling run</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Meeting title">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sync with Sarah"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Your email (organizer — must be connected via /auth/google)">
          <input
            required
            type="email"
            value={organizerEmail}
            onChange={(e) => setOrganizerEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Attendee emails (comma-separated)">
          <input
            required
            value={attendeeEmails}
            onChange={(e) => setAttendeeEmails(e.target.value)}
            placeholder="sarah@company.com, priya@company.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Duration (minutes)">
          <input
            required
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </Field>

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
          {create.isPending ? "Creating…" : "Start scheduling"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}