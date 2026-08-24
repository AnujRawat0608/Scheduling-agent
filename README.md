# Scheduling & Procurement Agents & Supply chain

Two agents built on the same LangGraph/Postgres/Express architecture, sharing one deployed app:

1. **Scheduling agent** — coordinates meetings: checks calendars, proposes times, waits for human approval, sends real Google Calendar invites.
2. **Procurement agent** — takes a freeform request ("50 units of Raspberry Pi 5 by September 15"), sources it against a real supplier catalog, compares quotes on price *and* lead time (not just cheapest), and pauses for human approval before confirming a purchase.

**Live:**
- App: https://scheduling-agent-web.vercel.app
- API: https://scheduling-agent-api.onrender.com

## Architecture

```
apps/
api/ Express + two LangGraph agents, Drizzle/Postgres, Langfuse tracing
web/ Next.js UI — scheduling, procurement, and a supply-chain catalog
```


Both agents share the same architectural spine:
- A LangGraph state machine, checkpointed to Postgres via `PostgresSaver`, so a run can pause for human approval — for minutes or days — and the process can fully restart without losing that paused state.
- LLM calls are scoped narrowly to *understanding intent or writing prose*. Anything that has to be factually correct (is this slot free, which supplier is actually cheaper) is deterministic code, not a model call.
- Every run pauses for human approval before anything irreversible happens (sending an invite, confirming a purchase) — even when the "obvious" answer is clear. False confidence from an agent acting on real calendars or real money is worse than one extra click.

### Scheduling agent graph

START → parseRequest → fetchCalendars → proposeSlots → humanApproval ──┬─→ sendInvites → END
└─→ END (rejected)
sendInvites ─(stale slot)─→ proposeSlots (loop)


- **parseRequest** — validates a structured request, or (via `/runs/from-text`) an LLM call turns freeform text like *"30 min with sarah@co.com next week, avoid mornings"* into structured fields, including boolean constraint flags (`avoidMornings`/`avoidAfternoons`) and a `meetingType` classification (escalation / customer_support / sales / interview / internal / general).
- **fetchCalendars** — one `freebusy.query` call using the organizer's OAuth token, covering every attendee. Google fills in what it can see (same Workspace domain, shared calendars); anyone it can't see is a warning shown to the human, not a silent gap.
- **proposeSlots** — deterministic gap-finding (`agent/lib/freeBusyMath.ts`), filtered by any stated constraints, then ranked by a fixed formula (soonest + mid-day preferred). No LLM involved in ranking or filtering.
- **humanApproval** — the interrupt point. Every run stops here.
- **sendInvites** — creates the real Calendar event. The invite's title gets a deterministic prefix per `meetingType` (e.g. `[Escalation] `), and its description is written by a second, narrowly-scoped LLM call tuned to that category's tone — with a deterministic fallback message if that call ever fails, so a flaky LLM call can never block a real invite.

### Procurement agent graph

START → generateRfq → sendRfqEmails → contactSuppliers → compareQuotes ──┬─→ humanApproval → confirmPurchase → END
└─→ END (nothing fulfills the order)


- **extractProcurementRequest** (pre-graph, in the route) — LLM call turning freeform text into item, quantity, required-by date, and specifications.
- **generateRfq** — LLM writes the RFQ email body; deterministic fallback template if the call fails.
- **sendRfqEmails** — sends the RFQ for real via Gmail (reusing the organizer's existing OAuth connection, with the `gmail.send` scope added) to any supplier emails provided. No-op if none were given.
- **contactSuppliers** — queries the **supply chain catalog** (`supplier_offers` table, managed at `/supply-chain`) for real matching entries. Only falls back to a seeded/simulated quote generator if nothing in the catalog matches the requested item — clearly a deliberate scope decision: reading and parsing real inbound supplier email replies is its own separate, much larger integration project, not something this build does.
- **compareQuotes** — deterministic scoring (`procurement/lib/scoreQuotes.ts`): price weighted 60%, lead time 40%, and any supplier that can't meet the requested quantity/MOQ is excluded from the ranking entirely rather than competing on price alone. This is the direct answer to "not simply the cheapest."
- **humanApproval** — always required, regardless of amount. The UI shows every quote (fulfillable and not, with a stated reason for each), the recommendation pre-selected, and lets a human approve any option — not just the algorithm's pick — or reject outright.
- **confirmPurchase** — finalizes the order (simulated purchase-order creation, clearly labeled as such — same principle as the supplier mock).

### Supply chain catalog

A small CRUD module (`/supply-chain`) for managing real product/supplier data: item name, supplier name, unit price, lead time, shipping cost, MOQ, and quantity available. This is what `contactSuppliers` queries against — add real entries here and procurement recommendations become genuinely data-driven instead of simulated.

## Evals

```bash
cd apps/api
npm run eval
```

Four suites, run together:
- **Free/busy logic** (deterministic) — conflict-detection correctness on the scheduling agent's gap-finding math.
- **Constraint enforcement** (deterministic) — `avoidMornings`/`avoidAfternoons` are actually filtered on, not just extracted and ignored (a real bug found and fixed during development — this suite exists specifically so it can't silently regress).
- **NL extraction** (calls the LLM) — scored rather than exact-matched, since model output has some legitimate variance even at temperature 0.
- **Quote scoring** (deterministic) — the procurement agent's "not simply the cheapest" behavior, and that suppliers who can't fulfill an order are never recommended over ones who can, even by tie.

Each suite has caught at least one real bug during development, including a normalization bug where a disqualified supplier could tie with (and rank above) the only qualifying one, and an eval-data bug where fixed day offsets could land on a weekend and produce false failures. Both are fixed; the postmortem for each is in the corresponding node/lib file's comments.

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env   # fill in DB, Groq, Google OAuth, Langfuse creds
cd apps/api && npx drizzle-kit push      # review the prompts carefully — see note below
npm run dev:api
# new terminal:
npm run dev:web
```

**On `drizzle-kit push`:** this project's LangGraph checkpoint tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) are created by `PostgresSaver.setup()` at runtime, not by Drizzle — so Drizzle doesn't know about them and will offer to "remove" them on every push. **Never accept that.** Only ever select `create table` for genuinely new tables; abort or decline anything involving the checkpoint tables. If they're ever accidentally deleted, they're harmless to lose (no user data lives in them) and get silently recreated the next time the API server boots.

### Auth model

Only the organizer connects Google (`GET /auth/google?organizerEmail=...`). Scopes: `calendar.events`, `calendar.freebusy`, `gmail.send`. Attendees and suppliers never authenticate anything — they receive normal emails, same as any real invite/RFQ.

## What's simulated, on purpose

Two things are deliberately mocked rather than fully built, both because the real version is a separate, much larger integration project on its own and can't be demoed live anyway:

- **Supplier quote fallback** — used only when the supply chain catalog has no matching entry. Seeded per item name so it's stable for testing, not random.
- **Purchase confirmation** — a real system would call a purchasing/ERP API; this creates a local record instead.

Everything else — calendar checks, invite sending, RFQ email sending, constraint enforcement, quote comparison, approval gating — is real.

## Known gaps

- No way to detect an attendee declining a scheduling invite after the fact, or a supplier's RFQ reply being read back into the system automatically.
- The procurement catalog match is a simple substring search (`ilike`) on item name — no fuzzy matching or synonym handling (e.g. "Pi 5" won't match "Raspberry Pi 5" unless the names actually overlap as substrings).
- Render's free tier cold-starts after 15 minutes of inactivity; kept warm in production via an UptimeRobot health-check ping every 5 minutes.

  


npm install
cp apps/api/.env.example apps/api/.env   # fill in DB, OpenAI, Google, Langfuse creds
npm run db:generate --workspace=apps/api
npm run db:migrate --workspace=apps/api
npm run dev:api
npm run dev:web
```

