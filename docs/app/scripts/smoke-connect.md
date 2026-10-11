# `app/scripts/smoke-connect.mjs`

The `--connect-flow` half of the deployed smoke (Plan 04-07). `smoke.mjs` calls `connectFlow` inside `clientFlow`, after `admin opened` and before `revoke`, so it runs on a real Standard resolution packet request with a real client cookie. It lives in its own module because `smoke.mjs` would otherwise pass the 500-line limit.

Run it with `pnpm -C app run smoke:connect <baseUrl>`. That package script loads the env files and passes `--auth --connect-flow`.

| Lines | What it does |
|-------|--------------|
| 1-4 | Header comment and the `node:fs` import. |
| 6-12 | Reads `app/src/lib/consent-text.ts` as text. `consentVersion(kind)` pulls `version` for `payroll_data` or `bank_data` out of it with a regex. The smoke always sends the same wording version that the Worker checks, so a wording change does not need a matching smoke edit. Without that, the route would answer 409 `consent_text_stale`. |
| 15-25 | `connectFlow({ base, client, staffHeaders, steps, requestId })`. `client` is `clientFlow`'s cookie-carrying `/api/c` fetch, `staffHeaders` is the bearer header set, and `steps` comes from `GET /api/c/state`. `ok(line, next)` prints `ok connect-flow <line>` and moves `step`. `json(res, status)` asserts the status and parses the body. |
| 26-28 | Finds the `payroll_connect` and `bank_connect` item ids among the state steps. |
| 29-38 | `GET /api/c/items/<item>/connection` → 200 for each item. Prints `ok connect-flow <kind> provider configured: yes|no` from `provider.configured`. For bank, it also requires `provider.id === 'plaid'` and `capabilities.statementPdfs === true`. |
| 39-44 | `POST /api/c/consents` for `payroll_data` (twice, to show a repeat is still 200) and `bank_data`. Each must return 200 `consented: true`. Prints `ok connect-flow consents`. |
| 45-60 | `POST /api/c/connections/<kind>/start { item_id }` for payroll, then bank. The expected answer follows the configured flag read above. With no keys, it must be 503 `provider_not_configured` → `ok connect-flow <kind> start 503 (no keys)`. With keys, it must be 200 with a string `bridge_token` (payroll) or an `https://` `hosted_link_url` (bank) → `ok connect-flow <kind> start 200 connection <id>`. The token and URL are checked, never printed. |
| 61-68 | Only when bank started: the bank item view must show `connection.status === 'pending'`, and `POST /api/c/connections/<id>/reconcile` must return 202. |
| 69-73 | `GET /c/return?nonce=bogusbogusbogusbogus` without following redirects must return 302 with `Location: /c/return`. A well-formed but unknown nonce enqueues nothing. |
| 74-79 | `GET /c/return` must return 200 HTML, and its `content-security-policy` must name `cdn.truv.com` and `my.truv.com` (D-16). |
| 80-86 | `GET /api/admin/requests/<id>/connections` with the bearer must return 200 with a `connections` array. Its length must equal the number of starts that returned 200 (0 with no keys, up to 2 with keys). |
| 87-92 | For each listed connection, `POST /api/admin/connections/<id>/refresh` must return 200, 502, or 503, and the code is printed. |
| 93 | Returns `keys: payroll yes|no, bank yes|no`. `smoke.mjs` prints it as `ok connect-flow complete (...)` after the revoke steps. |
| 94-98 | On any failure: prints `FAIL connect-flow <step>: <reason>` once, then throws an error marked `reported` so `clientFlow` stops without printing a second line. Its `finally` still deletes the probe request. |

## Privacy

Output is limited to ids, status codes, and yes/no flags (Phase 1 D-20). The bridge token, the Hosted Link URL, the client link, and the cookie never reach `console.log`. Run it only against Sandbox vendor keys and the fixture case 900003. The Worker's `PLAID_ENV` is `sandbox`, and the Truv environment is set by which Access Secret is installed.
