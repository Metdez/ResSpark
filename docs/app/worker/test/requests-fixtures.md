# `app/worker/test/requests-fixtures.ts`

Shared setup for the request route tests (`admin-requests.test.ts`, `admin-request-actions.test.ts`). It is not a test file: Vitest only collects `*.test.ts`. The `vi.mock` calls stay in each test file, because Vitest hoists them per file.

| Part | What it does |
|------|--------------|
| Ids | `FIRM`, `SUB` (the staff user), `CASE`, `REQ`, `LINK`, the fake Supabase origin `SUPA`, and `ORIGIN`, the prefix every minted URL starts with in `app.request()` (`http://localhost/c/`). |
| `env(over)` | A mock `Env` in fixture mode with a test HMAC key and `RESEND_FROM`. `over` adds or replaces bindings, for example `LOGICS_MODE: 'live'` or `RESEND_API_KEY`. |
| `initKeys()` / `token()` | Generate an ES256 key pair once and sign a short-lived staff JWT for `SUB` in `FIRM`. This is the same fabrication as `admin-lookup.test.ts`. |
| `stubFetch(other)` | Stubs global `fetch`. JWKS requests to `SUPA` get the public key, and every other URL goes to `other`, which defaults to a 500. The stub is returned so tests can inspect calls. |
| `outboundCalls(f)` | The stub's calls that were not JWKS requests, that is, calls that left the Worker. |
| `call(method, path, body, opts)` | Runs `app.request()` with a JSON body, a bearer token unless `auth: false`, and `env(opts.env)`. |
| `errorCode(res)` | Reads `error.code` from the envelope. |
| `caseRow`, `linkRow`, `clientLinkRow` | Row builders. The case is fixture 900001 (Jordan Rivera, `jordan.rivera@example.com`, `+15550100001`). The link expires in 2099. `clientLinkRow` is the full `client_links` row that `verifyLinkToken` expects from its finder. |
| `bundle(over)` / `sentBundle(link)` | A `RequestBundle` for a draft, and one for a request already sent to the fixture contact with a live link. |
