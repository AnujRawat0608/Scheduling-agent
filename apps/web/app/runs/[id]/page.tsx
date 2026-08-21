"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchRun, approveSlot, type TimeSlot } from "../../../lib/api";
import { format } from "date-fns";

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();

  const { data, isLoading,error } = useQuery({
    queryKey: ["run", params.id],
    queryFn: () => fetchRun(params.id),
    // Stop polling once the run leaves an in-progress state.
    refetchInterval: (query) => {
      const status = query.state.data?.state.status;
      return status === "done" || status === "failed" ? false : 2000;
    },
  });

  const approve = useMutation({
    mutationFn: (slot: TimeSlot) => approveSlot(params.id, slot),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["run", params.id] }),
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-neutral-500">Loading run…</div>;
  }

  const { run, state } = data;
  const awaitingApproval = state.status === "awaiting_approval";

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <div>
        <h1 className="text-lg font-medium text-neutral-900">{run.title}</h1>
        <StatusBadge status={state.status} />
      </div>

      {state.calendarErrors.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {state.calendarErrors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {awaitingApproval && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Pick a time to send invites for:</p>
          {state.proposedSlots.map((slot, i) => (
            <button
              key={i}
              onClick={() => approve.mutate(slot)}
              disabled={approve.isPending}
              className="w-full rounded-lg border border-neutral-200 p-4 text-left transition hover:border-neutral-400 disabled:opacity-50"
            >
              <div className="font-medium text-neutral-900">
                {format(new Date(slot.start), "EEEE, MMM d · h:mm a")}
              </div>
              {slot.rationale && (
                <div className="mt-1 text-sm text-neutral-500">{slot.rationale}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {state.status === "done" && state.selectedSlot && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Invites sent for{" "}
          {format(new Date(state.selectedSlot.start), "EEEE, MMM d · h:mm a")}.
        </div>
      )}

      {state.status === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          This run couldn't be completed.
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    gathering: "bg-neutral-100 text-neutral-600",
    proposing: "bg-neutral-100 text-neutral-600",
    awaiting_approval: "bg-blue-100 text-blue-700",
    sending: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
