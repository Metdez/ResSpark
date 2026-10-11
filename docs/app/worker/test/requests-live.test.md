# `app/worker/test/requests-live.test.ts`

A live test of the six request lifecycle RPCs from `supabase/migrations/0003_requests.sql`: confirm a Logics case, create a request, send it, open it, regenerate its link, revoke it. It calls them through supabase-js with the secret key (`service_role`), the way the Worker will, against project `zvkphuikjpwoauqdimcf`.

Run it with:

```
pnpm -C app run test:requests
```

`test:requests` loads `app/.env` and `app/.dev.vars` through `dotenv-cli` and runs only this file in the `worker-node` Vitest project. `pnpm -C app run test:live` also runs it with the other live tests. A plain `pnpm test` has no env, so the suite is reported as skipped.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports: the supabase-js client type, Vitest, and the Worker's `createAdminClient`. |
| 5-6 | What the file proves and how to run it. |
| 7-11 | The URL and secret key from the env; the ValorTax firm id; a second, nonexistent firm id for the cross-firm checks; the fixed probe Logics case id `999999001`; one day in milliseconds. |
| 13-17 | `Link`: the row shape `request_send` and `request_regenerate_link` return. |
| 19 | `describe.skipIf`: with no URL or secret key, the suite is skipped rather than failed. Under `test:requests` a skip means the env did not load. |
| 20-24 | State carried between the ordered tests: the client, the case id, the request id, the link, and the first `opened_at`. |
| 26-50 | One helper per RPC call with the probe's fixed arguments (`confirm`, `send`, `open`, `regenerate`, `revoke`). `send` takes a firm id so the cross-firm case can reuse it. |
| 51-55 | `countEvents`: how many `events` rows have this action for this case or request. |
| 56-65 | `request` and `linkRow` read the current `requests` / `client_links` row. |
| 67-69 | `beforeAll` builds the admin client (not at collection time, so a skipped run never needs the key). |
| 71-76 | `afterAll` deletes every request of the probe case, which cascades to its items, link, and client session. The case itself stays as a fixed fixture: `events.case_id` has no `ON DELETE` action and `events` is append-only, so a case with events cannot be deleted. Events stay too, filterable by `case_id`. |
| 78-87 | Two `case_confirm_logics` calls return the same uuid (upsert on `(firm_id, logics_case_id)`), and the case has at least two `case.looked_up` events. |
| 89-102 | `request_create` with `p_items: []` fails with `no_items`, and the case's request count is unchanged. |
| 104-114 | `request_create` with another firm's id fails with `case_not_found` (firm scoping, T-02-03). |
| 116-138 | `request_create` with two items that share a label returns a uuid; the items have positions `[1, 2]` and `required` `[true, false]`; the request is `draft`. |
| 140-157 | `request_send` with another firm's id fails with `request_not_found`. With the right firm it returns one row: `version` 1 and `expires_at` between 13.9 and 14.1 days from now. The request is `sent` with both contact fields stored, and there is exactly one `request.sent` event. |
| 159-162 | A second `request_send` fails with `request_not_draft`. |
| 164-176 | `request_open` returns a timestamp equal to `client_links.opened_at`, and the request is `opened`. A second call returns the same timestamp, and there is still exactly one `request.opened` event. |
| 178-185 | `request_regenerate_link` keeps the same link row, bumps `version` to 2, and returns a later `expires_at`. |
| 187-193 | `request_revoke` sets `client_links.revoked_at`, moves the request to `revoked`, and logs one `request.revoked` event. |
| 195-199 | After revoke: `request_open` fails with `link_inactive`, `request_revoke` with `request_revoked`, and `request_regenerate_link` with `request_not_active`. |

## Result (2026-10-11, live project `zvkphuikjpwoauqdimcf`)

`Test Files 1 passed (1)`, `Tests 10 passed (10)`, 0 skipped. A second run also passed 10/10, and afterwards the probe case had 0 requests and `client_links` / `request_items` held 0 rows.
