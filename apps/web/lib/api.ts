const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface TimeSlot {
  start: string;
  end: string;
  score?: number;
  rationale?: string;
}

export interface RunSnapshot {
  run: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  };
  state: {
    status: string;
    proposedSlots: TimeSlot[];
    calendarErrors: string[];
    selectedSlot: TimeSlot | null;
  };
  next: string[]; // which node runs next — empty if the run is finished
}

export interface RunSummary {
  id: string;
  title: string;
  status: string;
  organizerId: string;
  createdAt: string;
}

export async function listRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${API_BASE}/runs`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  const data = await res.json();
  return data.runs;
}

export interface Attendee {
  id: string;
  email: string;
  name?: string;
}

export interface CreateRunInput {
  organizer: Attendee;
  attendees: Attendee[];
  durationMinutes: number;
  title: string;
}

export async function createRun(input: CreateRunInput): Promise<{ runId: string }> {
  const res = await fetch(`${API_BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to create run");
  return res.json();
}

export interface CreateRunFromTextInput {
  text: string;
  organizerEmail: string;
}

export async function createRunFromText(
  input: CreateRunFromTextInput
): Promise<{ runId: string }> {
  const res = await fetch(`${API_BASE}/runs/from-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to create run");
  }
  return res.json();
}

export async function fetchRun(id: string): Promise<RunSnapshot> {
  const res = await fetch(`${API_BASE}/runs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch run ${id}`);
  return res.json();
}

export async function approveSlot(id: string, slot: TimeSlot) {
  const res = await fetch(`${API_BASE}/runs/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedSlot: slot }),
  });
  if (!res.ok) throw new Error(`Failed to approve run ${id}`);
  return res.json();
}

export async function rejectRun(id: string, note: string) {
  const res = await fetch(`${API_BASE}/runs/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reject: true, note }),
  });
  if (!res.ok) throw new Error(`Failed to reject run ${id}`);
  return res.json();
}
