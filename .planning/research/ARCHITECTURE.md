# Architecture Research

**Domain:** Two-sided tax-resolution document-collection platform (staff admin portal + token-gated client portal) on Cloudflare Workers + Supabase, integrating IRS Logics, Plaid/Teller, Truv, DocuSeal, Smarty, with the existing Python 433-A screening engine
**Researched:** 2026-10-10
**Confidence:** MEDIUM-HIGH (provider webhook/security mechanics verified against vendor docs; Python-Worker engine hosting and Teller statement support are the two MEDIUM/LOW items, flagged inline)

**Scope note:** brownfield. The existing layered Python pipeline (`.planning/codebase/ARCHITECTURE.md`) is not re-researched; this document says where it plugs in. Existing-system facts used here: `cases` / `case_financial_data` / `documents` / `document_extractions` / `determination_runs` tables exist with no writer and no RLS; `determination.py` talks only to the `StandardsRepository` Protocol (6 sync methods); `psycopg` is imported only in `case_api._from_database`.

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│ BROWSER (one React SPA, two route trees)                                    │
│  /admin/*  staff (Supabase Auth session)    /c/*  client (link cookie)      │
│  reads: supabase-js (RLS) + Realtime        reads+writes: /api/c/* only     │
│  writes: /api/staff/* only                  SDKs: Plaid Link / Truv Bridge /│
│                                             Teller Connect / DocuSealForm   │
└───────────┬───────────────────────────────────────────┬─────────────────────┘
            │ staff JWT (Bearer)                         │ cookie (HttpOnly) from link exchange
            ▼                                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE WORKER "api" (Hono, TypeScript) — also serves SPA static assets  │
│  /api/staff/*    verify Supabase JWT (JWKS)  ─┐                             │
│  /api/c/*        verify link token/cookie     ├─► domain/ (state machines)  │
│  /api/webhooks/* verify provider signature    │      │                      │
│  queue()         async work consumer          │      ├─► providers/ (fetch clients, server-side secrets)
│  scheduled()     cron: poll + reconcile       ┘      │     bank/{plaid,teller}  truv  docuseal  smarty  logics
│  Rate Limiting binding · Queues · (mTLS binding for Teller)                 │
└───────┬──────────────────────┬──────────────────────┬──────────────────────┘
        │ service-role RPC/REST │ service binding RPC  │ HTTPS + Basic auth (server-side only)
        ▼                       ▼                      ▼
┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ SUPABASE         │   │ WORKER "engine"       │   │ EXTERNAL                  │
│ Postgres + RLS   │   │ (Python Worker)       │   │ Logics V4 · Plaid/Teller  │
│ Auth (staff)     │   │ existing determination│   │ Truv · DocuSeal · Smarty  │
│ Storage (private)│   │ .py, financial_data.py│   │ OpenRouter                │
│ Realtime         │   │ + in-memory standards │   └──────────┬───────────────┘
└────────▲─────────┘   └──────────────────────┘              │ webhooks (Plaid, Truv, DocuSeal, Teller)
         │ Realtime (RLS-filtered change feed) to staff SPA    └──► /api/webhooks/* (back into the api Worker)
```

Rule of the diagram: **the browser never holds a secret and never writes to Postgres.** Staff browsers may *read* Postgres directly (RLS) and subscribe to Realtime; every write, for staff and client alike, goes through the Worker, which calls plpgsql RPC functions so state change + audit event commit in one transaction.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| SPA (`/admin`, `/c`) | UI only. Staff: lists, case view, approve/reject, 433-A view. Client: step list, SDK launchers, uploads | React + Vite + TS (shadcn-admin shell); TanStack Query; supabase-js for staff reads/Realtime only |
| API Worker | Authn/z for both audiences, orchestration, all integration calls, webhook intake, queue consumer, cron | Hono on Workers; Workers Static Assets for the SPA; one deploy |
| `auth/` | Staff JWT verification; client link token mint/verify/exchange | `jose` (JWKS for Supabase asymmetric keys); WebCrypto HMAC |
| `providers/*` | One thin typed `fetch` client per vendor + signature verifier + state reconciler. No business rules | Hand-written fetch + zod (avoid Node-oriented SDKs like `plaid-node`/axios on Workers) |
| `domain/*` | Request/item state machines, reconcile, push-to-Logics ledger, prefill suggestions | Pure TS functions calling Supabase RPC; unit-tested with Vitest |
| Queue `jobs` + consumer | Everything slow or retryable: webhook processing, statement download, scan, Logics push, activity note | Cloudflare Queues (+ DLQ) |
| Cron | Poll fallback every 5 min, expired-link sweep, webhook-endpoint health | Workers Cron Triggers → same `reconcileItem()` as the webhook path |
| Supabase Postgres | System of record for ResSpark state; RLS for staff reads; plpgsql RPCs for transitions | SQL migrations in `supabase/migrations/` |
| Supabase Storage | Private bucket for client and provider documents | Signed upload/download URLs minted by the Worker |
| Engine Worker (Python) | Runs unchanged `determination.py` + `financial_data.py` against an in-memory standards bundle | Cloudflare Python Worker, called by service-binding RPC (MEDIUM confidence, see below) |
| Logics | System of record for cases; receives documents + activity notes | Server-side only, Basic auth |

## Recommended Project Structure

```
supabase/
├── migrations/             # baseline = existing src/schemas/database_schema.sql, then additive files
│   ├── 0001_baseline_engine_schema.sql
│   ├── 0002_firms_staff_requests.sql
│   ├── 0003_connections_documents_signatures.sql
│   ├── 0004_events_webhooks_pushes.sql
│   ├── 0005_rls_and_grants.sql
│   └── 0006_rpc_transitions.sql
└── seed.sql                # firm row, lookup_standards.seed.sql stays where it is
worker/
├── wrangler.jsonc          # assets, queues, cron, rate-limit bindings, mtls_certificates, services
└── src/
    ├── index.ts            # Hono app + export { fetch, queue, scheduled }
    ├── routes/{staff,client,webhooks}/   # thin: parse → auth → call domain → respond
    ├── auth/{staffJwt,clientLink}.ts
    ├── domain/{requests,items,reconcile,logicsPush,prefill,determination}.ts
    ├── providers/
    │   ├── bank/{types,plaid,teller,index}.ts   # BankProvider interface + factory
    │   ├── truv.ts  docuseal.ts  smarty.ts
    │   └── logics/{client,find,documents,activity,errors}.ts
    ├── store/{objectStore,supabase}.ts          # ObjectStore interface (Supabase Storage impl)
    ├── crypto/{hmac,aead}.ts
    └── jobs/{consumer,cron}.ts
engine/                     # Python Worker wrapper only; imports the existing src/*.py unchanged
├── pyproject.toml  wrangler.jsonc
└── entry.py                # WorkerEntrypoint.evaluate(row, bundle) -> dict
src/                        # existing Python (unchanged) + src/frontend (rebuilt as the SPA)
docs/                       # one .md per code file (CLAUDE.md rule); every file <= 500 lines
```

### Structure Rationale

- **`routes/` thin, `domain/` pure:** webhook, cron, and staff "Refresh" button all call the same `reconcileItem()`; no logic lives in route handlers.
- **`providers/` isolated:** the only place that knows a vendor URL or secret; swapping Plaid for Teller touches `providers/bank/` and one config value.
- **`engine/` is a wrapper, not a rewrite:** the existing `src/` Python is imported as-is, preserving the CLAUDE.md rule that the determination module stays deterministic and its tests (27 passing) stay authoritative.
- **Baseline migration:** `database_schema.sql` uses plain `CREATE TABLE` inside `BEGIN/COMMIT`, so it becomes migration 0001 verbatim; all changes after are additive `ALTER`/`CREATE`.

---

## 1. Data Model (Supabase Postgres)

Single firm in v1, but every business table carries `firm_id` (cheap now, avoids a rewrite for white-labeling). Existing engine tables stay; ResSpark tables hang off `cases`.

```
firms 1─* staff(user_id → auth.users)
firms 1─* cases(+logics_case_id) 1─1 case_financial_data (existing)
cases 1─* requests 1─* request_items ─┬─ connections (kind bank|payroll) 1─* bank_accounts 1─* bank_transactions
                  │                   │                               1─* employments
                  │                   ├─ signatures (DocuSeal)
                  │                   └─ documents (existing, extended) 1─* document_extractions (existing)
                  1─* client_links (token version, expiry, revoke)
cases 1─* data_suggestions (prefill, staff-accepted → case_financial_data)
cases 1─* determination_runs (existing, immutable)
events (append-only audit)   webhook_events (idempotency ledger)   logics_pushes (push ledger)
connection_secrets / firm_secrets (service-role only)
```

Key columns (the rest follows the PROJECT.md requirements):

```sql
-- additive to existing cases
alter table cases add column firm_id uuid not null references firms(id),
  add column logics_case_id bigint, add column client_first text, add column client_last text,
  add column client_email text, add column client_phone text,
  add column logics_snapshot jsonb, add column logics_synced_at timestamptz,
  alter column id set default gen_random_uuid();
create unique index on cases(firm_id, logics_case_id);   -- never trust a client-supplied CaseID

create table requests (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null, case_id uuid not null references cases,
  created_by uuid not null references staff(user_id), sent_to_email text, sent_to_phone text,
  sent_at timestamptz, opened_at timestamptz, completed_at timestamptz, due_at timestamptz,
  status text not null default 'draft' check (status in ('draft','sent','opened','in_progress','done','cancelled')));

create table request_items (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null, request_id uuid not null references requests,
  kind text not null check (kind in ('bank','payroll','address','upload','sign','questionnaire')),
  doc_type text, label text not null, required boolean not null default true, sort int not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','submitted','approved','rejected','failed')),
  status_rank smallint generated always as (case status when 'pending' then 0 when 'in_progress' then 1
    when 'failed' then 1 when 'submitted' then 2 when 'rejected' then 1 when 'approved' then 3 end) stored,
  reviewed_by uuid, reviewed_at timestamptz, review_note text, provider_ref text);

create table client_links (
  id uuid primary key default gen_random_uuid(), firm_id uuid not null, request_id uuid not null references requests,
  version int not null default 1, expires_at timestamptz not null, revoked_at timestamptz,
  first_opened_at timestamptz, last_seen_at timestamptz, open_count int not null default 0);

create table connections (            -- one per bank link / payroll order
  id uuid primary key default gen_random_uuid(), firm_id uuid not null, request_item_id uuid not null references request_items,
  provider text not null,              -- 'plaid' | 'teller' | 'truv'
  provider_ref text,                   -- plaid item_id / truv order_id / teller enrollment_id
  link_token_ref text,                 -- plaid link_token for SESSION_FINISHED correlation
  state text not null default 'created', last_webhook_at timestamptz, last_polled_at timestamptz, error jsonb);
create table connection_secrets (     -- RLS on, ZERO policies, ZERO grants: service role only
  connection_id uuid primary key references connections, secret_enc bytea not null, key_id smallint not null);

alter table documents add column firm_id uuid, add column request_item_id uuid references request_items,
  add column source text not null default 'client'
    check (source in ('client','plaid','truv','docuseal','staff')),
  add column size_bytes bigint, add column sha256 text,
  add column scan_status text not null default 'pending'
    check (scan_status in ('pending','clean','infected','skipped_trusted','error'));

create table webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, event_key text not null,
  payload jsonb not null, received_at timestamptz default now(), status text not null default 'queued',
  attempts int default 0, last_error text, unique (provider, event_key));

create table logics_pushes (          -- ledger: Logics has no idempotency key and no "list documents" call
  id uuid primary key default gen_random_uuid(), firm_id uuid not null, case_id uuid not null, document_id uuid not null,
  pushed_by uuid not null, status text not null check (status in ('queued','sending','sent','failed','unknown')),
  logics_document_id bigint, attempt int not null default 0, error text, created_at timestamptz default now(),
  unique (document_id) where status in ('queued','sending','sent','unknown'));

create table events (                  -- append-only audit
  id bigint generated always as identity primary key, firm_id uuid not null, case_id uuid, request_id uuid, item_id uuid,
  actor_type text not null check (actor_type in ('staff','client','provider','system')), actor_id text,
  action text not null, data jsonb not null default '{}', ip inet, user_agent text, created_at timestamptz default now());
```

Notes that matter:

- **`status_rank` makes webhook handling monotonic.** Reducers update `where status_rank < new_rank` so a late or replayed event can never move an item backwards (rejected→in_progress is a staff action, not a provider event, and is the one allowed regression, done by an explicit RPC).
- **Request status is derived, not trusted:** a view `request_progress` computes opened / "N of M items submitted" / done from `request_items`; the stored `requests.status` is a cached projection updated inside the same RPC.
- **Do not put the 32-question answers anywhere new.** `case_financial_data` stays the single canonical record (NULL = unknown, 0 = known zero). Connected-data values land in `data_suggestions(case_id, canonical_column, value, source, confidence, accepted_by, accepted_at)`; staff acceptance is the only path into `case_financial_data` (same "evidence, never competing values" rule the schema header states for `document_extractions`).
- **Pre-existing discrepancy to resolve in Phase 1:** `question_definitions` has 28 rows ("All 28 taxpayer-facing questions") while CLAUDE.md and PROJECT.md say a 32-question contract. Reconcile before wiring intake to the database.

### RLS policy design (staff vs token-gated client)

Principle: **RLS protects staff reads; clients have no database identity at all.** The `anon` role gets nothing.

```sql
-- one cached lookup per statement, not per row
create function public.current_firm_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select firm_id from public.staff where user_id = (select auth.uid()) $$;
revoke execute on function public.current_firm_id() from public, anon;
grant  execute on function public.current_firm_id() to authenticated;

-- every firm-scoped table (firm_id is denormalized onto children so policies never join)
alter table public.request_items enable row level security;
create policy staff_select on public.request_items for select to authenticated
  using (firm_id = (select public.current_firm_id()));

-- the part people forget: Supabase grants table privileges to anon/authenticated by default
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete on tables from authenticated;

-- secrets and ledgers: RLS on, no policy, no grants
revoke all on connection_secrets, firm_secrets, webhook_events from authenticated, anon;
```

- Wrap `auth.uid()` and the helper in `(select …)` so Postgres caches it as an initPlan (Supabase RLS performance guidance). Index `staff(user_id)` and every `firm_id`.
- `staff.role in ('admin','agent')`. v1 policies are firm-wide for both roles; restricting an agent to assigned cases later is a policy change, not a schema change.
- `events` policy: select-only for staff; table-level `BEFORE UPDATE OR DELETE` trigger raises an exception (Gather uses the same append-only trigger pattern).
- Test RLS with pgTAP or a Vitest suite that signs in as staff of firm A and asserts zero rows for firm B, and that `anon` and `authenticated` cannot `insert` anywhere. This is the one place a mistake leaks tax data, so it gets tests before any feature.

---

## 2. Client Magic-Link Token

**Decision: a stateful, re-derivable, HMAC-signed opaque token. Not a JWT, not a random string stored in plaintext.**

```
token = base64url( link_id[16 bytes] || HMAC-SHA256(LINK_KEY, link_id || version)[32 bytes] )   // 64 chars
```

| Requirement | How it is met |
|-------------|---------------|
| Unguessable | 128-bit random `link_id` plus 256-bit MAC; guessing needs the MAC key |
| Signed | MAC over `link_id‖version`; verified with `crypto.subtle.verify` (constant time) before any DB hit beyond the id lookup |
| Expiring | `client_links.expires_at` (default 14 days, per-firm config); extend = update row |
| Revocable | `revoked_at` set, or bump `version` (old tokens fail the MAC). "Resend link" never mints a new secret unless staff chooses "rotate" |
| Staff can re-copy the link (PROJECT.md requirement) | Token is **re-derivable** from `link_id`+`version`+`LINK_KEY`, so nothing sensitive is stored and a DB dump yields no usable links. `GET /api/staff/links/:id/url` derives it and writes a `link_copied` event |
| Rate-limited | Workers Rate Limiting binding (see below) on exchange and on every `/api/c/*` call |
| No oracle | Every failure (bad MAC, unknown id, expired, revoked) returns the same 404 body and timing-flattened path |

**Exchange flow (keeps the token out of every API call and log line):**

1. Client opens `https://app.example/c/<token>` (from SMS/email or copied link). The Worker serves `index.html` for `/c/*`; **access logging for `/c/*` paths must redact the path** (Workers Logs record URLs).
2. SPA immediately `POST /api/c/session {token}`; Worker verifies MAC → loads `client_links` row → checks `revoked_at is null and expires_at > now()` → sets `opened_at` / `open_count` (event `link_opened`, first open flips request to `opened`).
3. Worker responds `Set-Cookie: __Host-rs_c=<HMAC-signed {link_id, version, exp=60min sliding}>; HttpOnly; Secure; SameSite=Lax; Path=/` and the SPA calls `history.replaceState` to drop the token from the URL bar.
4. Every `/api/c/*` request: verify cookie MAC, re-check the link row (indexed PK lookup; this is what makes revocation immediate), require header `X-Requested-With: resspark` (CSRF), return `Cache-Control: no-store`.
5. Static provider return URL: Plaid `completion_redirect_uri` and Truv return pages must be a fixed registered URL such as `/c/return`, which relies on the cookie to know who the client is; if the cookie is missing (different in-app browser) the page says "reopen your original link". **Assumption MEDIUM: that Plaid requires redirect URIs to be pre-registered/exact; verify in the Plaid dashboard.**

Page headers on `/c/*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, CSP allowing only `my.truv.com`, `cdn.truv.com`, Plaid, Teller (`cdn.teller.io`), `docuseal.com` frames, Smarty.

**Optional hardening, defer but design for it:** a knowledge check (last 4 of phone) before the first session, stored as a hash on `client_links`. Not in the MVP because it adds friction on the agent-on-the-phone flow the product exists to speed up; decide with ValorTax.

### How client routes read/write safely without a Supabase user

The Worker uses the **service-role key**, which bypasses RLS, so isolation is enforced in code, in one place:

```ts
// domain/clientScope.ts — the ONLY module client routes may import for data access
export function clientScope(link: VerifiedLink) {
  return {
    state: () => rpc('client_get_state', { p_request: link.requestId }),            // never returns other requests
    startItem: (itemId: string, kind: ItemKind) =>
      rpc('client_start_item', { p_request: link.requestId, p_item: itemId }),      // RPC re-checks item ∈ request
    uploadUrl: (itemId: string, name: string) => /* checks item ∈ request, kind='upload', size/mime caps */,
  };
}
```

- Every `client_*` RPC takes `p_request` from the *verified link*, never from the body, and checks `item.request_id = p_request` itself. A client cannot name a case, a firm, or another request.
- Client responses use explicit allow-listed DTOs (firm name, agent display name, item labels/status, reviewer note on rejection). Never `select *`.
- **Alternative considered and rejected for MVP:** minting a Supabase JWT with a `request_id` claim so RLS enforces client policies too. It is defense in depth, but needs custom-JWT signing against the project's JWT secret/signing keys and policies on every table. Revisit when more than one firm is on the platform. Mitigation until then: a Vitest suite that issues links for two requests and asserts every client route 404s on the other's item IDs.

**Rate limits (Workers Rate Limiting binding; per-location counters, so treat as abuse control, not exact quotas):**

| Key | Limit | Applies to |
|-----|-------|-----------|
| `ip` | 20 / min | `POST /api/c/session` |
| `ip + link_id-prefix` | 10 / min on failures | session exchange (brute force) |
| `link_id` | 120 / min | all `/api/c/*` |
| `link_id` | 30 / hour | upload-URL minting |
| `staff user_id` | 60 / min | Logics lookups (also protects Logics) |

`elithrar/workers-hono-rate-limit` is a ready Hono middleware pattern for this binding.

---

## 3. Webhook Ingestion, Idempotency, and Polling Fallback

All verified against vendor docs on 2026-10-10 unless marked.

| Provider | Verification (on the **raw body**, before JSON parse) | Event identity (idempotency key) | Delivery behavior |
|----------|-------------------------------------------------------|----------------------------------|-------------------|
| Plaid | `Plaid-Verification` header is an ES256 JWT; fetch JWK by `kid` via `POST /webhook_verification_key/get` (cache it); verify signature, reject `iat` older than 5 min, require `request_body_sha256 == sha256(rawBody)` (HIGH) | No event id: use `sha256(rawBody)` | Retries on non-2xx. Link events: `LINK / SESSION_FINISHED` carries `link_token` + `public_tokens[]`. Data: `TRANSACTIONS / SYNC_UPDATES_AVAILABLE`, `STATEMENTS / STATEMENTS_REFRESH_COMPLETE` (HIGH) |
| Truv | `X-WEBHOOK-SIGN: v1=<hex HMAC-SHA256(raw body, Access Secret)>`; compare constant-time (HIGH) | `webhook_id` in body | 10 s timeout; 4xx/5xx retried 3x at 30 s; **after ~3 days of failures the endpoint is auto-disabled and missed events are NOT replayed**; delivery order not guaranteed, sequence by `event_created_at`; docs say to fetch authoritative state from the API (HIGH) |
| DocuSeal | `X-DocuSeal-Signature: <ts>.<hex HMAC-SHA256(secret, "<ts>.<rawBody>")>`, reject if `|now−ts| > 300 s` (docs page current; MEDIUM that the Cloud tier offers it for your plan, else use a shared-secret custom header) | No id: `sha256(rawBody)` (or `submitter.id + event_type + timestamp`) | `form.completed` for a signer; `submission.completed` for all parties |
| Teller | `Teller-Signature: t=<ts>,v1=<sig>[,v1=…]` (header format HIGH; exact signed-string recipe **verify in docs before coding**, LOW) | Hash of body | n/a |

**Handler shape (one generic route, per-provider adapter):**

```ts
app.post('/api/webhooks/:provider', async (c) => {
  const adapter = webhookAdapters[c.req.param('provider')]; if (!adapter) return c.notFound();
  const raw = await c.req.text();                                  // raw first, never c.req.json()
  const verified = await adapter.verify(raw, c.req.raw.headers, c.env);
  if (!verified) return c.text('invalid', 401);                    // 401 → provider retries → fine; log, rate-limit by ip
  const key = adapter.eventKey(verified, raw);
  const { inserted } = await rpc('record_webhook', { p_provider: adapter.id, p_key: key, p_payload: verified.body });
  if (inserted) await c.env.JOBS.send({ type: 'webhook', provider: adapter.id, key });  // idempotent insert gates enqueue
  return c.text('ok', 200);                                        // < 1 s; all real work is in the queue consumer
});
```

`record_webhook` is `insert … on conflict (provider, event_key) do nothing returning true/false`. A duplicate delivery inserts nothing and enqueues nothing; a crash between insert and enqueue is healed by cron (re-enqueues rows stuck in `queued` > 2 min).

**Consumer = the single reconciler.** The webhook payload is treated as a *hint*; the consumer calls `adapter.fetchState(connection)` (Truv `GET /v1/orders/{id}/`; Plaid `/item/get`, `/statements/list`; DocuSeal `GET /submissions/{id}`) and applies the result through `apply_item_transition()` which is monotonic and idempotent. Poison messages retry with backoff then land in a DLQ; `webhook_events.status='dead'` shows in an admin health panel.

**Polling fallback (required, not optional, because Truv can silently disable the endpoint):**

1. **Client-triggered:** when Bridge `onSuccess`, Plaid hosted-link return, or DocuSeal `onComplete` fires, the SPA calls `POST /api/c/items/:id/reconcile`. UX no longer depends on webhook latency.
2. **Cron every 5 min:** select `connections`/`signatures` in `in_progress` where `coalesce(last_webhook_at,last_polled_at) < now() - interval '5 min'` and `created_at > now() - interval '3 days'`; call the same `reconcileItem()`. Back off to 30 min after 1 h.
3. **Daily health check:** call Truv's webhook-endpoint read API and alert if `enabled=false`; re-enable via the documented update endpoint.
4. **Staff "Refresh" button** per item calls the same function.

**Race to avoid (Plaid pattern):** create the `connections` row *before* returning the link token to the browser, storing `link_token_ref`, so a fast `SESSION_FINISHED` webhook can always find its connection. If it still cannot, leave the event `queued` and let the retry handle it rather than dropping it.

**Plaid hosted-link sequence** (matches PROJECT.md): `link/token/create(hosted_link, products incl. transactions+statements)` → store connection → client completes → `SESSION_FINISHED` → exchange `public_token` → encrypt + store `access_token` in `connection_secrets` → `/statements/refresh(start,end = 6 months)` → on `STATEMENTS_REFRESH_COMPLETE` enqueue `download_statements` job (list → download each PDF → Storage → `documents(source='plaid')`) and `sync_transactions` job on `SYNC_UPDATES_AVAILABLE`. Statement download is a queue job (not inline) because it is N sequential vendor calls.

**Truv sequence:** staff create request with a payroll item → Worker `POST /v1/orders/` (income + assets, email/phone, `notification_settings`) → store `provider_ref=order_id` → return `bridge_token`/`share_url` to client → `task-status-updated`/`order-status-updated` → reconcile fetches order, income report, statements/W-2 → documents + `employments` rows (one per employer link, so multiple jobs and a 1099 are just more rows).

**DocuSeal sequence:** Worker creates submission with `external_id = request_item_id`, `send_email=false`, returns the submitter embed `slug` → SPA renders `DocusealForm` (needs `frame-src`) → `form.completed` → consumer downloads signed PDF + audit log immediately (URLs are not permanent) into Storage as `documents(source='docuseal')` → item `submitted`.

---

## 4. Logics Integration Boundary

`providers/logics/` is the only code that knows Logics exists. Facts from `Logics_API_Documentation.docx.md`:

- Base `https://valortax.logiqsapi.com/publicapi/V4/` (store per firm), HTTP Basic `base64(API_KEY:SECRET_TOKEN)`. Per-endpoint scopes: `case.read` (Find*, CaseInfo), `case.write` (Create Case Document), `activity.write` (Create an Activity). **Confirm the issued key has all three**; a missing scope returns 403, which is the likely demo-day surprise.
- **The Find endpoints and CaseInfo take their parameters as HTTP *headers*** (`phone`, `CaseID`, …), not query strings. Easy to get wrong; wrap once and test.
- Response envelope `{Success, data, message, StatusCode, Timestamp}`. Documented codes are only 200/401/403/500: **no documented rate limit, no 429, no idempotency key, no "list case documents" endpoint.**
- Phone numbers are stored in inconsistent formats (`(121)121-2121`, `234234232`): normalize input to digits and try the documented variants; `data` is an array and may hold several cases, so the UI always makes staff pick and confirm.

**Client rules:**

| Concern | Rule |
|---------|------|
| Secrets | Wrangler secrets (`LOGICS_API_KEY`, `LOGICS_SECRET_TOKEN`); later per-firm in `firm_secrets`. Never in responses, logs, or `logics_snapshot` |
| Reads (Find/CaseInfo) | Live on every staff search; upsert `cases` with a snapshot only when staff **confirm** a match. Retry GET on 5xx/network, 2 attempts, jittered |
| Concurrency | Queue consumer for the push job `max_concurrency` low (e.g. 2) so a batch push cannot hammer an undocumented limit; treat any 429/503 as retry-after with exponential backoff |
| **Never blindly retry a multipart POST** | A timeout after bytes were sent may or may not have created the document; Logics cannot tell us. Use the `logics_pushes` ledger: `queued → sending → sent`; a timeout/5xx during `sending` sets `unknown` and requires a staff decision (re-send vs mark sent), shown plainly in the UI. The partial unique index prevents two live pushes of one document |
| 6 MB limit | `normalizeForLogics()` before send: PDF ≤ 6 MB as is; image → PDF (Cloudflare Images binding to downscale/re-encode, then wrap); oversize PDF → split by pages into numbered parts ≤ 6 MB with `pdf-lib`; if still impossible mark `failed: too_large` with a staff message. Run in the queue consumer (Worker memory is 128 MB, so stream and avoid holding multiple copies; **risk: large scanned PDFs, needs a spike**) |
| Category / comment | `FileCategoryID` comes from a `logics_file_categories(doc_type → id)` config table (no list-categories endpoint is documented, so ValorTax must supply IDs). `Comment` = `"ResSpark · <item label> · approved by <staff> <date>"` |
| Activity note | After all selected documents in a batch are `sent`, one `POST CaseActivity/Activity` (`Subject`, `Comment`, `ActivityType` from config — allowed values undocumented). Failure here never fails or re-sends documents; it has its own retry and a visible "note not written" badge |
| Authorization | Push endpoint requires `request_items.status='approved'` and `documents.scan_status in ('clean','skipped_trusted')`; `CaseID` is read from `cases.logics_case_id`, never from the request |

---

## 5. Bank-Provider Interface (Plaid ↔ Teller)

```ts
// providers/bank/types.ts
export type LinkStart =
  | { kind: 'plaid-hosted'; url: string }
  | { kind: 'plaid-embedded'; linkToken: string }
  | { kind: 'teller-connect'; applicationId: string; environment: 'sandbox'|'development'|'production' };

export interface BankProvider {
  readonly id: 'plaid' | 'teller';
  readonly capabilities: { statementPdfs: boolean; hostedSmsLink: boolean };
  startLink(ctx: { connectionId: string; client: ClientInfo; months: number }): Promise<LinkStart>;
  completeLink(input: unknown): Promise<{ providerRef: string; secret: Uint8Array; accounts: NormAccount[] }>;
  syncTransactions(conn: ConnRef, range: DateRange): AsyncIterable<NormTxn>;
  listStatements(conn: ConnRef, range: DateRange): Promise<StatementRef[]>;      // [] when !statementPdfs
  downloadStatement(conn: ConnRef, ref: StatementRef): Promise<ReadableStream<Uint8Array>>;
  parseWebhook(raw: string, headers: Headers, env: Env): Promise<BankWebhook | null>;  // verify + normalize
  reconcile(conn: ConnRef): Promise<ConnectionState>;
  revoke(conn: ConnRef): Promise<void>;
}
export const bankProvider = (env: Env, firm: Firm): BankProvider =>
  firm.config.bank_provider === 'teller' ? tellerProvider(env) : plaidProvider(env);   // the "one config line"
```

- **Normalize at the boundary.** Persist `bank_accounts` and `bank_transactions` in one provider-neutral shape (`amount_cents` integer, sign convention fixed as "negative = money out", `posted_date`, `pending`, `provider`, `provider_txn_id`). Plaid and Teller use opposite sign conventions for debits; do the flip inside each adapter and unit-test it with fixtures.
- **Front end mirrors the union:** `<BankConnect>` switches on `LinkStart.kind` (`react-plaid-link` / Teller Connect script / redirect to hosted URL). The rest of the client UI sees only "bank item: pending/in_progress/submitted".
- **Teller needs mutual TLS for development and production** (all requests involving end-user data). Workers supports this with an `mtls_certificates` binding: `env.TELLER_CERT.fetch(...)` presents the client certificate (upload with `wrangler mtls-certificate upload`). The Teller adapter must use that fetcher; this is the main hidden cost of "one config line" and should be spiked early (a community report exists of mTLS-binding fetch returning an empty 500, so verify on the real account). Teller access tokens go in as Basic auth username with empty password.
- **Teller statement PDFs: not confirmed.** I could not find a Teller statements endpoint in the docs searched, so assume `capabilities.statementPdfs=false` (LOW confidence). Consequence for the product: with Teller, "6 months of statements" becomes transactions plus either a generated transaction-summary PDF or a fallback upload item for the missing months. The staff case view should show per-account *statement coverage by month* so this gap is visible, not silent.
- **Per-client provider choice:** resolve the provider per connection (`connections.provider`), not per process, so old Plaid connections keep reconciling after a firm switches to Teller.

---

## 6. Where the 433-A Determination Engine Lives

**Decision: keep the Python engine, host it as a separate Python Worker, call it from the API Worker over a service binding. Do not port it to TypeScript; do not run `case_api.py`.**

Why this works with almost no change to the engine: `determination.py` is pure stdlib and reaches data only through the 6-method `StandardsRepository` Protocol; `psycopg` is imported solely in `case_api._from_database`. Cloudflare Python Workers run pure-Python code and (as of the 2026-08-03 changelog) Python and JS Workers can call each other via RPC over service bindings with no schema code.

```
Staff clicks "Run 433-A prefill"
 → API Worker: load case_financial_data row (NULL preserved) + accepted suggestions
 → Supabase RPC standards_bundle(state, county)      -- new SQL fn, reuses canonical_state_name / normalize_county_name
 → env.ENGINE.evaluate(row, bundle)                  -- service-binding RPC
 → engine/entry.py: DictStandardsRepository(bundle) → intake_workflow.evaluate_case(row, repo)
 → returns the existing result_for_row payload shape
 → API Worker inserts determination_runs (immutable snapshot) + event, returns to staff
```

- **Why a bundle:** the repository methods are *synchronous* and a Pyodide Worker cannot make blocking HTTP calls. `standards_bundle()` returns the small global tables (national, health-care, transportation ownership/operating, state-region) plus the case-specific county rows (housing for all household sizes, MSA area) as JSON; `DictStandardsRepository` (about 40 lines, new file `src/standards_memory.py`) implements the Protocol over it and raises the same `StandardsLookupError` on a miss. Standards stay in SQL; the county-suffix normalization stays in SQL; nothing becomes a Python constant (CLAUDE.md rule preserved).
- **Tests:** existing 27 unittest tests remain the oracle; add one parity test running `PostgresStandardsRepository` vs `DictStandardsRepository` on the same fixtures against a real database before trusting the bundle path.
- **Known engine debt that blocks "trust" more than hosting does** (from CONCERNS.md): hard-coded thresholds in `determination.py`, no `test_determination.py`, `FinancialData` zero-defaults on non-database paths, `csed_months_remaining <= 0` branch. The service boundary should pass only `case_financial_data` rows through `financial_data_from_case_row` so the safe database path is the only path.
- **Confidence MEDIUM** on Python Worker hosting: docs describe it as first-class and RPC is documented, but I did not verify GA status, cold-start cost, or the stdlib surface the engine uses (`dataclasses`, `typing.Protocol`, `decimal`) under Pyodide. **Gate the phase on a half-day spike:** deploy a hello-world engine Worker, call it from the API Worker, run the existing tests inside `pywrangler`.
- **Fallbacks, in order:** (a) port only if the spike fails, with the Python tests converted to shared JSON fixtures so both implementations are checked against the same cases; (b) a small container service. Neither is needed for the Oct 12 demo: 433-A is a later phase and the staff view can ship as "coming next".
- **LLM boundary:** OpenRouter is called only from a separate `classifyDocument` job and writes `document_extractions` / `data_suggestions` with `ai_flags`; it is never imported by the engine path. Add redaction (SSN, account numbers) before any document text leaves (CONCERNS.md item) and require staff acceptance of AI-sourced fields.

---

## 7. Document Storage, Scanning, Encryption

**Storage decision: Supabase Storage (private bucket) behind a 4-method `ObjectStore` interface; R2 is the planned swap, not the start.**

| Option | For | Against |
|--------|-----|---------|
| **Supabase Storage (chosen)** | Same vendor/auth/backups as the DB; signed upload URLs incl. resumable TUS (`createSignedUploadUrl` token passed as `x-signature`); bucket-level `file_size_limit` + `allowed_mime_types`; no extra credentials | Egress cost at scale; Worker is not a native binding |
| R2 | Native Worker binding, zero egress fees, S3-compatible | Metadata and access control fully app-built; presigned URLs via `aws4fetch`; second vendor to secure and back up |

- Bucket `case-documents`, private. Key: `{firm_id}/{case_id}/{request_item_id}/{document_id}`. No client-chosen path segments.
- **Client upload flow:** `POST /api/c/items/:id/uploads {name,size,type}` → Worker checks item ∈ request, kind, size ≤ 25 MB, type allow-list → creates a `documents` row (`scan_status=pending`) and a signed upload URL → browser uploads directly (TUS for resumable-on-reload, as the PROJECT requires) → `POST …/complete` → Worker verifies object exists, size matches, **sniffs magic bytes from the first bytes** (PDF/JPEG/PNG/HEIC only; never trust extension or client MIME), stores `sha256`, enqueues `scan` → item `submitted` only after the doc is accepted.
- **Downloads:** staff only, via Worker-minted signed URLs, 5-minute TTL, `Content-Disposition: attachment`, event `document_downloaded`. Never render client files inline in the staff origin; show previews from a server-rendered image/PDF page or a sandboxed viewer (CONCERNS.md already flags `innerHTML` rendering of extracted text).
- **Provider-sourced files** (Plaid statement PDFs, Truv/DocuSeal outputs) enter the same pipeline with `source != 'client'` and `scan_status='skipped_trusted'` after the magic-byte check.

**Virus scanning (honest options):**

| Option | Notes | Verdict |
|--------|-------|---------|
| Strict controls only (type allow-list, magic-byte check, size cap, no inline render, reject PDFs containing `/JavaScript`, `/Launch`, `/EmbeddedFile` via a cheap byte scan) | Zero vendor, zero data egress, ships in the demo | **v1 baseline** |
| Cloudflare WAF malicious-upload detection | Scans on the request path; our uploads go browser→Supabase directly, so it never sees them | Not applicable to this flow |
| Hosted scan API (e.g. attachmentAV; reference pattern R2→Queue→scanner Worker) | Fast to wire, per-scan price, **sends taxpayer documents to a third party** | Only after an explicit privacy decision |
| Self-hosted ClamAV (container) | Keeps data in-house; Gather's own docs say ClamAV wants 3–4 GiB RAM | Phase after demo if the firm requires it |

Whatever is chosen plugs into one place: the `scan` queue job sets `documents.scan_status`; **download and Logics push are gated on `scan_status in ('clean','skipped_trusted')`**, so enabling a real scanner later changes no other code.

**Encryption:**

- At rest for files and DB: Supabase-managed (AES-256 on the platform; treat as vendor assurance, MEDIUM, confirm in the DPA).
- **Application-level encryption for credentials only:** Plaid `access_token`, Teller token, Truv link credentials go in `connection_secrets.secret_enc` as AES-256-GCM (WebCrypto) with a per-row random IV and a `key_id` for rotation; key in a Wrangler secret (`TOKEN_ENC_KEY_1`). Only the Worker can read them; `authenticated` has no grant.
- Gather additionally envelope-encrypts every file before storage and ships a key-rotation CLI. Defer for ResSpark; because `ObjectStore` is an interface, an `EncryptingObjectStore` decorator can be added later without touching callers.
- Retention: Gather's FTC Safeguards mapping (16 CFR 314.4(c)(6) disposal) is a useful checklist; add `documents.retain_until` early since it is a column, not a feature.

---

## 8. Real-Time Status for the Admin Dashboard

**Decision: Supabase Realtime *Postgres Changes* for the staff dashboard, with query refetch as the correctness backstop. Clients poll.**

| Option | Verdict |
|--------|---------|
| Postgres Changes on `request_items`, `requests`, `events` filtered `firm_id=eq.<id>` | **Chosen.** Honors the same RLS as reads, needs no extra auth config, trivially adequate for tens of staff. Supabase notes cost scales with subscribers × writes (every change is authorized per subscriber) and recommends Broadcast-from-database above roughly 3,000 concurrent subscribers; ResSpark is nowhere near that |
| Broadcast via `realtime.broadcast_changes()` trigger + private channels + `realtime.messages` RLS | Supabase's recommended path for scale; more setup (policies on `realtime.messages`). Switch only if subscriber counts ever demand it |
| Pure polling | Fine as fallback, not as primary: PROJECT.md requires "no manual reload" |
| Durable Object WebSocket hub | Over-engineered; Supabase already provides the channel |

Implementation notes:

- Add the tables to the `supabase_realtime` publication in a migration. Postgres Changes filters allow one `eq` filter, which is why `firm_id` is denormalized onto `request_items`/`events`.
- Treat events as **cache invalidation hints** for TanStack Query (`queryClient.invalidateQueries(['request', id])`), not as the data source. Events missed during a disconnect are healed by refetch on reconnect, on window focus, and a 30 s `refetchInterval` only while the channel status is not `SUBSCRIBED`.
- Because all writes go through RPCs that update `request_items` and insert an `events` row in one transaction, the dashboard needs to subscribe to just those two tables to show "bank connected", "N of M docs uploaded", timestamps, and an activity feed.
- **Client side has no Supabase identity, so no Realtime.** `/api/c/state` is polled (3 s for the first minute after a provider SDK closes, then 10 s, paused when the tab is hidden); the explicit `reconcile` call on SDK completion makes it feel instant.

---

## Architectural Patterns

### Pattern 1: Webhook as hint, reconcile as truth
**What:** verify → idempotent insert → enqueue → consumer re-reads provider state → monotonic transition RPC. **When:** every provider event. **Trade-offs:** one extra API call per event and a queue hop (tens to hundreds of ms); in return, out-of-order, duplicate, lost, and disabled-endpoint failures all collapse into one code path that cron also uses.

### Pattern 2: Reads direct (RLS), writes through the Worker (RPC)
**What:** staff SPA uses supabase-js `select` + Realtime; every mutation is `POST /api/staff/*` → plpgsql RPC doing state change + `events` insert atomically. **When:** all staff actions. **Trade-offs:** one more hop for writes; in return the audit log cannot be bypassed, `authenticated` has no write grants, and integration side effects (Logics, Plaid) live next to the write.

### Pattern 3: Deny-by-default database, scoped service role
**What:** RLS enabled everywhere, `anon` empty, secrets tables with no policies; client routes reach data only via `clientScope(link)` RPCs that take the request id from the verified link. **Trade-offs:** the Worker is a high-value target (service role key); keep it in Wrangler secrets, no logging of request bodies, and minimize the Worker's dependency surface.

### Pattern 4: Provider adapters behind interfaces with normalized storage
**What:** `BankProvider`, `ObjectStore`, `Scanner`, `DeterminationPort` interfaces; one factory reads config. **When:** anything the PROJECT says "must be swappable" or that carries vendor risk. **Trade-offs:** an interface per seam; keep them to the methods actually used (no speculative methods).

### Pattern 5: Ledger for non-idempotent external writes
**What:** `logics_pushes` state machine with an `unknown` state that needs a human. **When:** any write to a system with no idempotency key and no read-back (Logics documents). **Trade-offs:** UI for the ambiguous state; the alternative is silent duplicate documents in a client's legal file.

---

## Data Flow

### Request flow: send link → client completes → push to Logics

```
Staff search (phone/email/case id)
  → GET /api/staff/logics/find  → logics/find.ts (headers!) → Logics → candidates → staff confirms
  → POST /api/staff/requests    → RPC create_request (cases upsert, items, client_link, event)
  → link URL derived (HMAC) → staff copy/SMS-by-provider/email

Client opens /c/<token> → POST /api/c/session → cookie → GET /api/c/state (step list)
  bank:    POST items/:id/start → providers/bank.startLink → SDK → provider
  payroll: POST items/:id/start → Truv order → Bridge
  address: Smarty autocomplete (key restricted by referer) → POST items/:id/address → county → data_suggestions
  upload:  signed URL → Storage → complete → magic-byte → scan job
  sign:    DocuSeal submission → embed → form.completed

Provider webhook → /api/webhooks/:p → verify → webhook_events (dedupe) → Queue
  → consumer: fetchState → apply_item_transition (monotonic) → events row
  → Postgres Changes → staff dashboard invalidates + refetches

Staff approve/reject per item (RPC) → select approved docs → POST /api/staff/logics/push
  → logics_pushes rows → Queue (low concurrency) → normalizeForLogics → multipart POST → sent
  → batch complete → CaseActivity note
```

### State management

```
Postgres (truth) ──Realtime hint──► TanStack Query cache ──► React components
        ▲                                   │ mutation
        └── RPC (state + event, one tx) ◄── Worker ◄── fetch('/api/staff/…')
```

### Key data flows

1. **Connected data → 433-A:** Plaid/Truv/Smarty/Logics values → `data_suggestions` → staff accept → `case_financial_data` → `engine.evaluate` → `determination_runs`. Staff acceptance is the only door into the canonical record.
2. **Secrets:** vendor tokens exist in three places only: Wrangler secrets (ours), `connection_secrets` (encrypted, per connection), and the vendor. Never in `events`, logs, or API responses.
3. **Audit:** every transition RPC writes an `events` row (actor, action, ids, ip, user agent); link copy, document download, push, approve/reject, and revoke are all events.

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1 firm, ~10 staff, hundreds of open requests (v1) | Everything above as-is. One Worker, one queue, one Postgres. No pooling concerns (REST/RPC, no direct connections) |
| 5–20 firms (white-label) | Per-firm secrets in `firm_secrets`, per-firm Logics base URL and category map, per-firm webhook secrets/endpoints; subdomain or `firm` claim routing; RLS already firm-scoped |
| 100+ firms | Consider Broadcast instead of Postgres Changes, partition `events` and `bank_transactions` by month, move PDF normalization to a dedicated consumer Worker, evaluate R2 for egress |

### Scaling priorities

1. **First bottleneck:** Logics throughput and PDF normalization (CPU/memory in the consumer), not the database. Fix with queue concurrency control and a dedicated consumer.
2. **Second bottleneck:** Storage egress and `bank_transactions` volume (6 months × accounts × clients). Fix with R2 behind `ObjectStore` and monthly partitions.

## Anti-Patterns

### Anti-Pattern 1: Parsing JSON before verifying the signature
**What people do:** `await c.req.json()` then recompute HMAC over `JSON.stringify`. **Why wrong:** byte differences break the MAC (Truv explicitly warns), or verification is skipped. **Instead:** `await c.req.text()` first, verify on those bytes, then `JSON.parse`.

### Anti-Pattern 2: Trusting webhook payloads and delivery order
**What people do:** write `status = payload.status`. **Why wrong:** replays, reordering, and spoofed-but-signed-old events regress state. **Instead:** reconcile from the API, monotonic `status_rank`.

### Anti-Pattern 3: Letting browsers write to Postgres or hold a service-ish key
**What people do:** reuse `VITE_SUPABASE_PUBLISHABLE_KEY` for inserts guarded by RLS "just for now". **Why wrong:** one missing policy leaks tax data (CONCERNS.md: existing tables have no RLS). **Instead:** revoke writes from `authenticated`, nothing for `anon`, all writes via Worker RPC.

### Anti-Pattern 4: Token in every request URL, or plaintext tokens in the DB
**Instead:** exchange for a cookie once, redact `/c/*` logs, store only `link_id`/`version`/`expires_at`.

### Anti-Pattern 5: Auto-retrying the Logics document POST
**Instead:** ledger + `unknown` state + human decision (Section 4).

### Anti-Pattern 6: Duplicating the engine in TypeScript "for convenience"
**Why wrong:** a second implementation of perjury-adjacent math with a second set of thresholds. **Instead:** one engine, called over RPC; port only if the Python Worker spike fails, and then with shared JSON fixtures.

### Anti-Pattern 7: Reintroducing the "second case-data path"
The codebase doc already forbids it. New code (prefill, Logics import, Smarty county) must write `data_suggestions`, never build its own row dict for the engine.

### Anti-Pattern 8: Depending on Realtime for correctness
**Instead:** Realtime invalidates; refetch is truth.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Logics V4 | Server-side Basic auth; header-param GETs; ledgered multipart POST; activity note | Undocumented rate limit; scopes `case.read/case.write/activity.write`; 6 MB cap; no list-documents call |
| Plaid | Hosted Link (SMS) or embedded Link; `SESSION_FINISHED` → exchange → Transactions sync + Statements refresh/list/download | JWT webhook verification with 5-min `iat` window; statements only at supported institutions, so show coverage per month |
| Teller | `TellerConnect` + REST with `env.TELLER_CERT.fetch` (mTLS) and token Basic auth | mTLS required in dev/prod; statement PDFs unconfirmed (LOW) |
| Truv | `POST /v1/orders/` → Bridge/`share_url`; `task-status-updated`, `order-status-updated`; fetch order + reports | `X-WEBHOOK-SIGN` HMAC; 10 s timeout; endpoint auto-disables after sustained failure; allowlist optional (3 published IPs) |
| DocuSeal | Create submission (`external_id` = item id) → `DocusealForm` embed → `form.completed` → pull signed PDF + audit log | Frame CSP; cloud vs self-host decision affects webhook auth mode |
| Smarty | US Autocomplete Pro, browser key restricted by referer/host | Returns county → drives IRS local standards; write result to `data_suggestions` |
| OpenRouter | Queue job only, after redaction | Never in the determination path |
| Supabase | `@supabase/supabase-js` service client in Worker; anon client in staff SPA only | JWT verification via JWKS (`jose`), not the deprecated shared secret where signing keys are enabled |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| SPA ↔ Worker | JSON over HTTPS; staff Bearer JWT / client cookie | Two disjoint route trees, two auth middlewares, never shared handlers |
| SPA(staff) ↔ Supabase | supabase-js reads + Realtime | Select-only grants |
| Worker ↔ Postgres | Service-role REST + RPC functions | Multi-table writes only via plpgsql RPC |
| Worker ↔ Engine Worker | Service-binding RPC | Inputs: canonical row + standards bundle; output: existing result payload |
| Webhook route ↔ consumer | Cloudflare Queue + `webhook_events` | Exactly-once effect via DB unique key, at-least-once delivery via queue |
| domain ↔ providers | TypeScript interfaces | Domain never imports a vendor module directly |

## Suggested Build Order (dependencies drive phase structure)

1. **Foundation (blocks everything):** repo hygiene from CONCERNS.md (`.gitignore`, untrack `dist/`), Supabase migrations 0001–0006 (firms, staff, extended `cases`, requests, items, links, events, RLS + grants, transition RPCs), staff auth + Hono Worker skeleton + Workers Static Assets deploy + CI. Also resolve the 28-vs-32 question discrepancy. *RLS tests land here.*
2. **Logics read path + request creation:** `providers/logics` (Find/CaseInfo with header params), staff lookup-and-confirm UI, create request, derive/copy link, client shell (`/c`, session exchange, step list, rate limits). Delivers the demo moment "send link, client opens it". Needs: 1.
3. **Uploads + staff review + audit + Realtime:** signed upload, magic-byte check, document list, approve/reject, `events` feed, Realtime invalidation. First end-to-end value without any vendor. Needs: 1, 2.
4. **Webhook/queue/reconcile framework, proven on Truv:** generic `/api/webhooks/:provider`, `webhook_events`, queue consumer, cron poller, client-triggered reconcile, DLQ visibility. Truv first (simplest: `share_url`, HMAC). Needs: 3.
5. **Bank provider interface + Plaid (hosted link, transactions, statements):** `connection_secrets` encryption, normalized accounts/transactions, statement-coverage view; Teller stub implementing the interface (and the mTLS spike) after. Needs: 4.
6. **DocuSeal e-sign:** submission, embed, webhook, signed-PDF ingestion. Needs: 4.
7. **Push to Logics:** `logics_pushes` ledger, `normalizeForLogics`, category config, activity note, `unknown` resolution UI. Needs: 3 (approved docs), 2 (Logics client). Can ship a minimal "single small PDF" version for the demo and harden after.
8. **Address (Smarty) + prefill + 433-A view:** `data_suggestions`, `standards_bundle()`, engine Worker (after its spike), `determination_runs`, staff review UI. Needs: 3, plus 5/6 data to be useful; also needs Nicole/Sandra layout input.
9. **Hardening:** scanner plug-in, redaction + AI extraction job, reminders, hash-chained audit export, retention, key rotation, per-firm secrets.

**Oct 12 demo-critical subset:** phases 1, 2, 3, plus Truv and Plaid in sandbox from 4–5 (even if the poller and Teller are stubs), DocuSeal embed from 6 if time allows, and a minimal Logics push from 7. Everything else is iteration after the Monday feedback.

**Research flags for phases:** Phase 5 (Teller mTLS and statement support), Phase 7 (Logics category IDs, ActivityType values, real rate behavior, PDF splitting memory), Phase 8 (Python Worker spike) need deeper phase-level research; Phases 1–4 and 6 follow standard patterns.

## Reference Repositories

| Repo | Use it for | Verified / caveat |
|------|-----------|-------------------|
| `seziro-team/gather` | Closest product match: no-account magic-link portal, per-item approve/reject, reminders, hash-chained append-only audit trail with DB trigger, AES-256-GCM file encryption, `file-type` magic-byte sniffing, 5-min signed downloads, rate limiting, optional ClamAV, `threat-model.md` / `safeguards-rule-mapping.md` | Fetched README. **AGPL-3.0, alpha, 0 stars, Next.js + Drizzle + pg-boss on plain Postgres (different stack)**: copy patterns and read its `docs/`, do not copy code |
| `plaid/pattern` | End-to-end Plaid: Link, webhook handler, `link_events` / API-event logging tables, webhook→client push | Fetched: 544 stars, Express + React + Postgres. Predates Hosted Link/Statements; take the webhook-handling and event-logging structure only |
| `docusealco/docuseal` and `docusealco/docuseal-react` | Embedded signing and webhook payloads | Named in PROJECT.md; payload shapes verified in DocuSeal API docs |
| `satnaing/shadcn-admin` | Admin shell, data tables | Per PROJECT.md decision (MIT) |
| `elithrar/workers-hono-rate-limit` | Hono middleware over the Workers Rate Limiting binding | Found via search; small, pattern-level |
| `widdix/attachmentav-example-cloudflare-r2-virus-malware-scan` | Upload → Queue → scanner Worker → delete-if-infected pattern | Found via search; vendor example, adapt the shape to Supabase Storage |
| `cloudflare/python-workers-examples` | Python Worker + `pywrangler` setup for the engine | Linked from Cloudflare docs; use for the spike |
| Supabase docs: Realtime (Postgres Changes / Broadcast), Storage resumable uploads with signed tokens, RLS performance | Policies, publication setup, TUS with `x-signature` | Official docs fetched. I did not verify a specific `supabase/supabase` example app for Worker + token-gated access; no close public example was found, so Pattern 3 above is first-party design (MEDIUM) |

## Open Questions

1. Does Plaid accept a dynamic or only an allow-listed `completion_redirect_uri`? (Shapes the `/c/return` design.)
2. Logics: `FileCategoryID` list, allowed `ActivityType` values, any real rate limit, and whether the issued key holds `case.write` and `activity.write`.
3. Teller: statements endpoint existence; sign convention; mTLS certificate onboarding time.
4. Is sending client documents to a hosted virus-scan API acceptable to ValorTax, or must scanning stay in-house?
5. DocuSeal Cloud vs self-hosted (webhook auth mode, data residency of signed PDFs).
6. Knowledge-check on the magic link (last 4 of phone): yes or no for v1.
7. Python Worker spike result (cold start, Pyodide compatibility of the existing modules).

## Sources

- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `src/schemas/database_schema.sql`, `Logics_API_Documentation.docx.md` (read directly; Find/CaseInfo header params, scopes, 6 MB limit, response envelope) — HIGH
- Plaid webhook verification, SESSION_FINISHED, STATEMENTS_REFRESH_COMPLETE, SYNC_UPDATES_AVAILABLE: Context7 `/websites/plaid_api` (plaid.com/docs/api/webhooks/webhook-verification, /api/products/statements, /api/products/transactions) — HIGH
- Truv webhooks (signature, retries, auto-disable, ordering, idempotency): https://docs.truv.com/api-reference/webhooks — HIGH
- DocuSeal webhook signature and `form.completed` payload: https://www.docuseal.com/resources/use-webhooks, https://www.docuseal.com/docs/api — MEDIUM (plan/tier availability unconfirmed)
- Teller mTLS requirement and webhook header: https://teller.io/docs/api/authentication, https://teller.io/docs/guides/environments, https://teller.io/docs/api/webhooks — HIGH for mTLS, LOW for signing recipe and statements
- Cloudflare mTLS binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/ — HIGH
- Cloudflare Python Workers and Python↔JS RPC: https://developers.cloudflare.com/workers/languages/python/, https://developers.cloudflare.com/workers/languages/python/packages/, https://developers.cloudflare.com/changelog/post/2026-08-03-python-javascript-rpc/ — MEDIUM (GA/cold-start not verified)
- Cloudflare Rate Limiting binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/; Queues retries/DLQ: https://developers.cloudflare.com/queues/configuration/batching-retries/ — HIGH
- Supabase Realtime Postgres Changes vs Broadcast scaling and authorization: https://supabase.com/docs/guides/realtime/postgres-changes, https://supabase.com/docs/guides/realtime/subscribing-to-database-changes — HIGH
- Supabase resumable uploads and signed upload tokens: https://supabase.com/docs/guides/storage/uploads/resumable-uploads — HIGH
- Cloudflare WAF malicious uploads (request-path scanning): https://developers.cloudflare.com/waf/detections/malicious-uploads/; R2 scanning pattern: https://attachmentav.com/blog/antivirus-for-cloudflare-r2/ — MEDIUM
- https://github.com/seziro-team/gather (README), https://github.com/plaid/pattern (README) — MEDIUM (single-source repo descriptions)

---
*Architecture research for: two-sided tax-resolution document-collection platform (ResSpark)*
*Researched: 2026-10-10*
