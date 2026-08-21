# Scheduling Agent

An agent that coordinates scheduling: given a request ("30 min with Sarah and
Priya next week"), it checks everyone's calendars, proposes candidate times,
pauses for a human to approve, then sends the invites.

## Architecture

```
apps/
  api/    Express + LangGraph agent, Drizzle/Postgres, Langfuse tracing
  web/    Next.js UI for reviewing and approving runs
```

### The graph

```
START → parseRequest → fetchCalendars → proposeSlots → humanApproval ──┬─→ sendInvites → END
                                                                        └─→ END (rejected)

sendInvites ─(stale slot / double-booked)─→ proposeSlots  (loop)
```

- **parseRequest** — fills in gaps (duration, deadline, constraints) from
  freeform text via an LLM call, if the request wasn't already structured.
- **fetchCalendars** — only the organizer connects a calendar. One
  `freebusy.query` call, made with the organizer's token, asks about every
  attendee at once; Google fills in busy blocks for anyone it can see
  (same-domain colleagues, shared calendars) and reports the rest as
  inaccessible. Attendees it can't see aren't a failure — they're a warning
  shown to the human before approving, since those times aren't confirmed.
- **proposeSlots** — deterministically computes every open gap
  (`agent/lib/freeBusyMath.ts`), then uses an LLM only to *rank* those gaps
  against freeform constraints. Correctness (is this slot actually free) is
  kept out of the LLM's hands; only preference-ranking is.
- **humanApproval** — the interrupt point. Uses LangGraph's `interrupt()`
  with the Postgres checkpointer, so the process can fully exit while
  waiting on a human — no polling loop, no held-open connection. Every run
  passes through here before an invite goes out, not just ambiguous ones.
- **sendInvites** — creates the calendar event. If it fails because the slot
  went stale between proposal and send, it loops back to `proposeSlots`
  rather than dying.

### Why Postgres checkpointing matters here

Scheduling requests can sit "awaiting approval" for hours or days — a human
might not check their phone until tomorrow. `PostgresSaver` persists full
graph state at the interrupt, so resuming is just
`graph.invoke(Command({resume: decision}), {configurable: {thread_id}})`
from any process, any time later.

### Langfuse

Every `graph.invoke` call gets a `langfuse-langchain` `CallbackHandler`
tagged with the run id, so each node execution shows up as a span in one
trace per scheduling run. Good starting evals: did the agent propose a slot
every attendee could actually make, and did it respect stated constraints.

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env   # fill in DB, OpenAI, Google, Langfuse creds
npm run db:generate --workspace=apps/api
npm run db:migrate --workspace=apps/api
npm run dev:api
npm run dev:web
```

## Auth model

Only the organizer connects Google Calendar (`GET /auth/google?organizerEmail=...`).
Attendees never authenticate anything — they receive a normal email invite,
same as any calendar invite. This means the agent can't see an attendee's
busy times unless their calendar happens to be visible to the organizer
(same Workspace domain, or explicitly shared) — see `fetchCalendars`.

## What's stubbed / not built yet

- **Runs list page** (`/runs`) — only the detail page is scaffolded.
- **Token encryption at rest** — `calendarConnections` stores tokens in
  plaintext; wrap with pgcrypto or app-level encryption before production.
- **shadcn/ui components** — the approval UI uses plain Tailwind; swap in
  shadcn `Card`/`Button` once the component library is installed.
- **Conflict/decline handling after send** — `handleConflict` described in
  the design isn't a distinct node yet; sendInvites' retry-on-failure edge
  covers the immediate double-booking case but not "attendee declines a day
  later."
