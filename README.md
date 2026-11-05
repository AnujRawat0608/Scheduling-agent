# Metis: AI procurement and supply-chain risk agent

Metis helps hardware teams source components. A buyer describes what they need in plain English ("50 units of SanDisk Ultra 64GB microSD card by 2026-11-30"). The agent finds supplier quotes, ranks fulfilment plans by price, lead time and deadline fit, optionally checks shipping-route risk, and **always pauses for human approval** before anything is sent to a supplier.

Live app: https://procurement-agent-web.vercel.app

**Status:** pre-launch, built solo. No users or revenue yet. Payments run in Razorpay test mode.

---

## What it does

### 1. Sourcing agent (buyer)
- Takes a free-text request, a pasted BOM, or an uploaded BOM file (`.xlsx`, `.csv`, `.txt`).
- Extracts line items, quantities and a required-by date with an LLM.
- Searches registered suppliers (the platform catalog), the web, or both.
- Prices every quote deterministically (tax, shipping, FX) and ranks by price, lead time and deadline fit, using a **Prioritise** setting (balanced, cheapest, fastest).
- Builds a recommended fulfilment plan (one supplier, or split across suppliers) plus alternatives, each with a plain-language rationale.
- Optionally runs a route-risk check for each supplier country against the buyer's delivery country.
- Stops for a decision. The buyer approves the recommended plan, picks an alternative, or **rejects with a category and a note**.
- After approval, creates one RFQ per chosen supplier, with the unit price fixed to the supplier's listed price, and emails it.

### 2. Supplier portal
- Suppliers register, build a public profile, and manage a product catalog (price, MOQ, lead time, stock, tax, images).
- They receive RFQs in an inbox and submit quotes, see orders, and mark orders as shipped.
- An admin reviews and verifies suppliers.

### 3. Buyer orders and billing
- Buyers accept a supplier's quote, which creates an order priced from the stored quote **including the tax and shipping the agent showed in the plan**.
- Direct cart orders from a supplier's profile page are priced server-side from the catalog.
- Payment goes through Razorpay (test mode today). An order becomes `confirmed` only after the server verifies the payment, and is then shipped by the supplier.
- The Billing page lists the signed-in buyer's own orders, offers **Pay now** on unpaid orders, and generates PDF invoices for paid orders.

### 4. Route risk
- The user picks an origin and destination country. The risk service reports risk per transport mode (sea, air, road, rail): the tracked chokepoints on the lane, their status (green, yellow, red) and the news events behind it.
- A global overview shows all tracked chokepoints, and a Q&A endpoint answers natural-language questions over live risk data.
- Risk data is advisory. It never blocks an order and does not change quote ranking.

---

## Architecture

```
                    Browser (buyer, supplier, admin)
                              |
                       Next.js web app  ---------------------+
                       (Vercel)                              |  (map, overview, Q&A)
                              |                              |
                              v                              v
        +----------------------------------------+   +----------------------+
        | Express API (apps/api)                 |   | Risk service         |
        |  - REST routes: auth, catalog, RFQs,   |-->|  (FastAPI, PostGIS,  |
        |    orders, payments, uploads, FX       |   |   hosted on Render)  |
        |  - LangGraph procurement agent         |   |  - ingestion         |
        |  - Deterministic pricing core          |   |  - scoring           |
        +----------------------------------------+   |  - route risk API    |
                    |                                +----------------------+
                    v                                          |
   Postgres (data, history, agent checkpoints)                 v
   Supabase Storage (product images)                 Postgres + PostGIS
   Groq, Firecrawl / Tavily, Razorpay, SMTP          NewsAPI, Open-Meteo, Groq
```

| Part | Stack | Responsibility |
|---|---|---|
| `apps/web` | Next.js 14, React 18, TypeScript, Tailwind, TanStack Query | Buyer, supplier and admin UIs, risk map (react-simple-maps, d3-geo) and globe (react-globe.gl), cart, PDF invoices (jspdf), BOM upload, display-currency conversion |
| `apps/api` | Express, LangGraph (Postgres checkpointer), Drizzle ORM, Postgres, Nodemailer, Razorpay | Auth, catalog, RFQs, orders, payments, FX, and the procurement agent |
| Risk service (`supply-chain-risk-agent`) | FastAPI, psycopg2 (pooled), PostGIS, Groq | News and weather ingestion, risk scoring, route risk by country pair, Q&A agent |

The API's risk client calls `POST /route-risk` with `origin_country` and `destination_country`, defined in `supply-chain-risk-agent`. The older `apps/risk-agent` exposes `POST /procurement/route-risk` with a different request and response shape and is kept for reference.

### Design principles
1. **LLMs only understand intent or extract facts.** Prices, totals, FX, tax, deadline checks and ranking are deterministic code, in integer cents.
2. **Humans approve every purchase.** No RFQ or order is created before approval.
3. **Only registered suppliers can be in a plan.** Web-found quotes are shown for reference, with confidence and source link, and are never part of an approvable plan. The buyer orders those on the supplier's own site.
4. **LLM output is never trusted on its own.** Web offers must pass code-side checks (see Web sourcing).
5. **The order matches the plan.** The same money rules price a quote in the plan and an order built from it, and a test proves the totals agree.
6. **Failures degrade gracefully.** Web discovery, route-risk checks, history logging and emails never fail a procurement run.

---

## The procurement agent

```
START -> contactSuppliers -+- registered only ------> compareQuotes
                           +- web / both -> webDiscovery -> compareQuotes

compareQuotes -+- nothing to approve (failed / web-only) -> END
               +- plan ready -> riskCheck -> humanApproval -> sendRfqs -> END
```

State is checkpointed to Postgres (`PostgresSaver`), so a run can wait for a decision for days and survive a restart.

| Step | What it does |
|---|---|
| `extractProcurementRequest` (route, before the graph) | Groq structured output (Zod) turns text into line items and a deadline. Past deadlines are rejected. |
| `contactSuppliers` | Postgres full-text search on offer titles, with an accessory filter so a "case" is not returned for a "Raspberry Pi 5". |
| `webDiscovery` | Runs only for web or both. De-duplicates web results against registered suppliers by normalised company name. Never fails the run. |
| `compareQuotes` | Prices, scores and ranks quotes, then builds plans. |
| `riskCheck` | Optional. One lane per distinct supplier country. Domestic lanes are skipped. Advisory only. |
| `humanApproval` | `interrupt()`. The run always pauses here. The buyer approves a plan or rejects with a category and note. |
| `sendRfqs` | One RFQ per supplier leg, idempotent per task and supplier. |

### Pricing and ranking (`compareQuotes`)
- Every quote is priced in integer cents: tax-inclusive prices have tax extracted, tax-exclusive prices have it added, shipping is added, then each component is converted to INR with stored FX rates and the rounded lines are summed. Two-decimal currencies only. A missing exchange rate makes the quote unpriceable instead of guessing.
- `score = (priceScore x wPrice + leadScore x wSpeed) x trust`
  - `priceScore = cheapest total / this total` (capped at 1)
  - `leadScore = (fastest lead time + 1) / (this lead time + 1)` (capped at 1)
  - Weights (price / speed): balanced 0.6 / 0.4, cheapest 0.85 / 0.15, fastest 0.2 / 0.8
  - `trust` is 1 for registered quotes and `0.8 x confidence` for web quotes
- Cheapest and fastest baselines come from registered quotes only, so one wrong scraped price cannot drag everyone's score down.
- A quote with less stock than the quantity, or an MOQ above it, scores -1 and is excluded.
- Ordering: usable before unusable, on-time before late, higher score, lower price, faster.
- Plans enumerate every one-supplier-per-item combination (capped at 5,000, with a greedy fallback). Plans sort by: meets deadline, fewer suppliers, higher average score, lower total cost.

### Web sourcing
Uses a search API, not an in-house crawler, so the server never fetches arbitrary URLs.
- Firecrawl (`/v1/search`) is preferred when `FIRECRAWL_API_KEY` is set. Tavily is the fallback. With neither, web and both requests return 400.
- Up to 8 pages per item. Pages that look like blogs or news, or contain no price-like text, are skipped before any model call.
- Groq extracts structured offers from the relevant lines of each page.
- An offer is dropped unless the model marked it as the requested product, the page does not say out of stock, the price is positive with a valid currency code, and the model's evidence excerpt appears **verbatim on the page** and contains the claimed price.
- A contact email is kept only if it appears on the page. Confidence is computed in code (0.75 exact, 0.5 likely, plus 0.05 if in stock).
- Page text is treated as untrusted data in the prompt.
- Web quotes are flagged with stock unknown, shipping unknown (0 means "not quoted"), MOQ 1 when unstated, and a 14-day lead time assumed when none is given.

---

## RFQs, orders and payments

- **Agent RFQs** are created after approval, one per supplier, with reference `RFQ-<task id prefix>-<leg>`. A unique index on `(task_id, supplier_id)` makes retries safe. Unit prices are fixed to the supplier's listed price in the buyer's chosen currency, converted at that day's rate. Each line also carries the listing's tax rate, tax mode and shipping, fixed by the server. The server overwrites price, quantity and currency on the supplier's quote.
- **Manual RFQs** come from the "Send RFQ" form.
- **Accepting a quote** checks that the buyer owns the RFQ, the quote is current and not expired, then claims the RFQ and creates the order in one transaction. Tax and shipping come from the RFQ, never from the supplier's quote.
- **Direct orders** take only product IDs and quantities from the client. Name, price, currency, tax and shipping come from the catalog, saved as a snapshot. The buyer's email comes from their login, never from the request.
- **Order lifecycle:** `pending` (awaiting payment) -> `confirmed` (paid) -> `shipped`. The only route that sets `confirmed` is payment verification.
- **Payments:** the charged amount is always the order's server-side total. Razorpay payments are verified with an HMAC signature check. Payment routes require the signed-in buyer who owns the order. `PAYMENT_MODE=demo` skips the gateway and is ignored when `NODE_ENV=production`.
- **Email** (RFQs, shipping notices, inquiries) is best effort and bounded by a timeout so a slow mail server never blocks a purchase.

### Authentication
Buyer, supplier and admin each have their own token type. Every route accepts only its own kind, and this is covered by automated tests. Admin tokens carry an admin type marker and may use a separate secret (`ADMIN_JWT_SECRET`).

### Main API areas
| Area | Purpose |
|---|---|
| `/api/procurement` | Create a request, list requests, read a task with live graph state, approve or reject |
| `/api/rfqs`, `/api/rfqs/by-task`, `/api/rfq-orders` | RFQs, supplier quotes, buyer lookup by task, accepting a quote |
| `/api/supplier-orders`, `/api/payments` | Direct orders, the buyer's order list, supplier shipping, payment sessions and verification |
| `/api/catalog`, `/api/supply-chain`, `/api/offers` | Catalog search, supplier listings, product images |
| `/api/procurer-auth`, `/api/supplier-auth`, `/api/admin-auth` | Registration and login for each role |
| `/api/suppliers`, `/api/admin/suppliers` | Supplier profiles, admin verification |
| `/api/fx-rates` | Exchange rates (units per USD) |

---

## Data model

**API database:** `procurers`, `suppliers`, `admins`, `supplier_offers` (catalog), `offer_images`, `procurement_tasks`, `risk_assessments`, `rfqs`, `rfq_quotes`, `supplier_orders`, `supplier_order_items`, `supplier_messages`, `supplier_certifications`, `supplier_verification_events`, `fx_rates`, plus the LangGraph checkpoint tables created at runtime by `PostgresSaver.setup()`.

**History tables (append-only, row-level security on):**
- `price_observations`: every real quote the agent sees (supplier, price, currency, lead time, shipping, tax). Simulated quotes and placeholder values are excluded.
- `plan_decisions`: every approval and rejection, with the plan chosen, the options shown and the risk status. Rejections carry a category and a note.
- `quote_requests` and `order_events`: RFQ and order activity history.
- A trigger on `supplier_offers` logs every catalog price change.
- `supplier_metrics` is a view for supplier reliability figures.

History logging never fails a request. See the migrations for exact columns.

**Risk database** (PostGIS): `chokepoints`, `routes`, `route_chokepoints`, `events`, `event_chokepoints`, `risk_scores`, `source_health`.

---

## Risk service

**Pipeline**
1. `newsapi_ingest.py` fetches headlines. Groq classifies each into relevance, event type, severity (1-5), confidence and likely chokepoint (from a fixed list). `weather_ingest.py` turns Open-Meteo wave height into weather events with no LLM. Both write through shared helpers that de-duplicate by `source_ref` and clamp values to the database constraints.
2. `risk_scoring.py` rolls events from the last 72 hours into a 0-100 score per chokepoint: `sum(severity^1.5 x confidence x decay) x 4`, capped at 100, with a 24-hour half-life. Green below 34, yellow from 34, red from 67.
3. `route_risk_api.py` and `route_inference.py` map a country pair to chokepoints per mode: curated lanes in the database first, then sea-region corridors; air uses a straight-line proxy; rail and road use small curated corridor tables. Lanes with no mapping report "unknown", never "safe".

**Endpoints:** `GET /chokepoints`, `GET /chokepoints/{id}`, `GET /routes`, `GET /routes/{id}/alternatives`, `POST /ask`, `POST /route-risk`, `GET /health`.

Risk output is directional, based on publicly reported events from roughly the last 72 hours. It is not a guarantee of safety.

---

## Getting started

**Prerequisites:** Node.js 20+, Python 3.11, Postgres for the API, Postgres with PostGIS for the risk service, a Groq API key.

### 1. Install
```bash
npm install
```

### 2. Environment
Create `.env` files from the examples and never commit them.

`apps/api/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | API Postgres (also used for agent checkpoints) |
| `JWT_SECRET` | Required. Signs login tokens |
| `ADMIN_JWT_SECRET` | Optional. A separate secret for admin tokens (falls back to `JWT_SECRET`) |
| `GROQ_API_KEY` | Request extraction and web extraction |
| `WEB_APP_URL` | Allowed CORS origin (default `http://localhost:3000`) |
| `PORT` | API port (default 3001) |
| `RISK_AGENT_URL` | Risk service base URL (default `http://127.0.0.1:8000`) |
| `FIRECRAWL_API_KEY`, `TAVILY_API_KEY` | Web sourcing providers |
| `WEB_EXTRACT_MODEL`, `WEB_DEBUG`, `WEB_MAX_PAGES`, `WEB_CONCURRENCY`, `WEB_TIMEOUT_MS`, `WEB_MAX_QUOTES_PER_ITEM` | Optional web sourcing settings |
| `ALLOW_SIMULATED_SUPPLIERS` | `true` enables fake demo quotes. Keep off in production |
| `PROCUREMENT_REPLY_TO` | Reply-to address on RFQ emails (must be a real address) |
| `RFQ_REPLY_WITHIN_DAYS` | Days a supplier has to answer an agent RFQ (default 3) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TIMEOUT_MS` | Outgoing email |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Product image storage |
| `PAYMENT_MODE`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `MERCHANT_NAME` | Payments (`demo` or `razorpay`, use `rzp_test_` keys while developing) |
| `NODE_ENV` | Set to `production` in production |

`apps/web/.env.local`: `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api`) and the risk service URL used by `apps/web/lib/riskAgentApi.ts`.

`supply-chain-risk-agent/.env`: `DATABASE_URL` (PostGIS), `GROQ_API_KEY`, `NEWSAPI_KEY`, and optionally `SEA_GEOSPATIAL_FALLBACK`.

### 3. Databases
```bash
# API database
npm run db:migrate
npm run seed:admin --workspace=apps/api        # creates the first admin

# After changing a Drizzle schema file
npm run db:generate
```

Risk database (PostGIS required): apply `db/schema.sql`, then the migrations in `db/`. The ingestion helpers expect a unique constraint on `events.source_ref` and a `source_health` table. Lanes in `routes` and `route_chokepoints` are not seeded by `schema.sql`; add them or rely on the built-in region corridors.

### 4. Run
```bash
npm run dev:api          # API
npm run dev:web          # web (new terminal)

cd supply-chain-risk-agent
python -m venv venv && venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 5. Feed the risk service
Ingestion and scoring are plain scripts. Schedule them (cron, GitHub Actions or your host's cron job). NewsAPI's free plan allows about 100 requests a day, so every few hours is enough for news, and weather can run hourly or every few hours.
```bash
cd supply-chain-risk-agent
python -m app.services.newsapi_ingest
python -m app.services.weather_ingest
python -m app.services.risk_scoring
```
If these do not run, risk scores go stale. Free hosting tiers can put the service to sleep, so the first request after idle time may be slow.

---

## Tests and evals
```bash
npm run eval --workspace=apps/api
```

| Suite | What it checks | Kind |
|---|---|---|
| Quote scoring (15 checks) | Currency conversion, tax, stock and MOQ filtering, ranking behaviour, missing exchange rates | Deterministic |
| Invoice calculation (22 checks) | Totals, tax-inclusive and tax-exclusive, FX, rounding, bad input | Deterministic |
| Order maths (24 checks) | An order built from a quote totals the same as the plan, including tax and shipping | Deterministic |
| Auth separation (17 checks) | Buyer, supplier and admin tokens are each accepted only by their own routes | Deterministic |
| Procurement extraction (48 checks, 10 scenarios) | Item count, names, quantities and dates from real-style requests, including shared quantities, "a dozen", thousands separators, relative dates and a pasted BOM | LLM (Groq) |

- LLM evals need a Groq key and are subject to Groq's rate limits. The extraction eval reports a pass rate and does not fail the run, because model output can vary between runs.
- Scenarios live in `apps/api/src/evals/procurementExtractionScenarios.ts`. Add one whenever the extractor gets a real request wrong.
- The free/busy, constraint and meeting-extraction sections belong to the original scheduling agent and go away with the legacy code.

---

## Project structure
```
scheduling-agent/              (repo folder name is historical)
  apps/
    api/                       Express API + procurement agent
      src/procurement/         graph, nodes, scoring, pricing, FX, web sourcing, risk client
      src/routes/              REST routers
      src/lib/                 shared helpers (order maths, mail, storage, countries)
      src/db/                  Drizzle schemas and client
      src/agent/               auth helpers, mail helpers (also legacy scheduling agent)
      src/evals/               evaluation suites
      drizzle/                 SQL migrations
    web/                       Next.js app
      app/                     pages: procurement, quotes, rfq, suppliers, supply-chain, routing, billing, catalog, admin
      components/              risk badges and overview, agent activity, RFQ and checkout dialogs
      lib/                     API clients and helpers
    risk-agent/                earlier version of the risk service (kept for reference)
  supply-chain-risk-agent/     risk service used by the API (FastAPI)
    app/main.py                endpoints
    app/services/              ingestion, scoring, route inference, Q&A agent
    db/                        schema and migrations
```

---

## Known limitations and roadmap

This is an early build. Before real customers:

- **Payments:** move from test mode to live, with a payment webhook as the source of truth, order expiry for unpaid orders, supplier payouts and refunds.
- **Orders:** reserve or decrement stock, key order ownership to the buyer account instead of email, and use one shipping policy (plans add shipping per line, direct orders charge the highest once).
- **Sourcing:** approve the exact listing a buyer clicked (rows from one supplier can map to the same plan), allow only KYC-verified suppliers in plans, add part-number (MPN) matching and fuzzier search.
- **Buyer UI:** show a goods, tax, shipping and total breakdown before a quote is accepted. The supplier quote screen currently shows goods only.
- **Reliability:** run agent jobs through a durable queue, add an email outbox with retries, reconcile tasks stuck in transient states, and reduce polling.
- **Observability:** attach Langfuse tracing to the procurement graph (a helper exists from the original agent but is not yet wired in), and track cost and latency per run.
- **Evals:** grow the extraction set with real buyer requests and harder cases, and add evals for web-offer extraction.
- **Risk data:** schedule ingestion and monitor source health, widen news queries beyond the current few, de-duplicate syndicated stories, calibrate scoring against known disruptions, and show data age honestly in the UI.
- **Coverage:** more currencies beyond USD, INR, EUR, GBP, AED and SGD, a buyer currency other than INR, and use risk as a ranking factor.
- **Cleanup:** remove the legacy scheduling code and rename the repo and packages.

## Security notes
- Keep `.env` files out of version control and rotate any key that was ever committed.
- Set `NODE_ENV=production` in production so demo payments cannot run, and prefer a separate `ADMIN_JWT_SECRET`.
- RFQ emails need a real reply-to address. Placeholder `*.local` addresses are rejected.
- Use unique passwords for demo accounts.

## Author
Built by Anuj Rawat.
