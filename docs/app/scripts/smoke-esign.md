# `app/scripts/smoke-esign.mjs`

The `--esign-flow` half of the deployed smoke (Plan 06-08). `smoke.mjs` calls `esignFlow` inside `clientFlow`, after `admin opened` (and after `connectFlow` when both flags are given) and before `revoke`, so it runs on a real Standard resolution packet request with a real client cookie. It lives in its own module because `smoke.mjs` would otherwise pass the 500-line limit.

Run it with `pnpm -C app run smoke:esign <baseUrl>`. That package script loads the env files and passes `--auth --esign-flow`.

The flow works in both key modes. Without Smarty keys the address step proves the manual fallback; without a DocuSeal key (or with no template mapped) the signing start proves the honest 503. The final line names the mode: `ok esign-flow complete (keys: smarty yes|no, docuseal yes|no)`.

| Lines | What it does |
|-------|--------------|
| 1-4 | Header comment: what the flow covers and what it never prints. |
| 5 | Imports `consentVersion` from `smoke-connect.mjs`, which reads the ESIGN wording version (`esign-v1` today) out of `app/src/lib/consent-text.ts`, so a wording bump never breaks the smoke. |
| 7-17 | `esignFlow({ base, client, staffHeaders, steps, requestId, url })`. `client` is `clientFlow`'s cookie-carrying `/api/c` fetch, `staffHeaders` the bearer header set, `steps` the `GET /api/c/state` steps, and `url` the client link held in memory. `ok(line, next)` prints `ok esign-flow <line>` and moves `step`; `json(res, status)` asserts the status and parses the body. |
| 19-22 | Finds the `address` and `signature` item ids among the state steps (the Standard resolution packet has both). |
| 24-35 | `GET /api/c/address/suggest?q=1600%20Amphitheatre`. 503 must carry `provider_not_configured` (Smarty: no); otherwise 200 with at least one suggestion (Smarty: yes, and the first suggestion is kept). Prints `ok esign-flow address suggest (smarty: yes|no)`. |
| 37-42 | `POST /api/c/items/<address>/address`. With Smarty it posts the first suggestion as `source: 'smarty'`; without, the fixed manual address `1 Main St, Springfield, IL 62701`, which must come back `verified: false`. Prints only `verified: yes|no`, never the address text. |
| 44-53 | `GET /api/admin/requests/<id>/review` with the bearer. `address` must be present: with Smarty a 5-digit `county_fips` and a non-null `rdi`; without, `source 'manual'` and `county_fips` null. `signatures` must have exactly one entry with `template_key 'engagement_letter'`. |
| 55-57 | `POST /api/c/consents { kind: 'esign', text_version }` must answer 200 `consented: true`. |
| 59-70 | `POST /api/c/items/<signature>/signature/start`. 503 must carry `provider_not_configured` or `template_not_mapped` (DocuSeal: no); otherwise 200 with an `embed_src` starting `https://docuseal.com/s/` (DocuSeal: yes; the connection id is printed, the embed link never). Anything else fails. |
| 72-81 | `GET /c/sign/<signature>` must be 200 HTML, and its `content-security-policy` must contain `https://cdn.docuseal.com` and `https://docuseal.com`, with a `font-src` directive that names `https://docuseal.com` (D-15). |
| 83-87 | Copied signing link (D-17): `GET <link url>?step=<signature>` without following redirects must answer 302 with `Location: /c/?step=<signature>`. It runs last because it exchanges the link a second time; the flow's own cookie stays valid for the revoke checks that follow. |
| 89 | Returns the mode string for `smoke.mjs` to print. |
| 90-93 | Any failure prints `FAIL esign-flow <step>: <reason>` once and rethrows with `reported`, so `clientFlow` does not print it again; its `finally` still deletes the probe request. |

## Notes

- The address is written to fixture case 900003 (Morgan Lee, `example.com` contact). Cases are never deleted, so the last smoke's address stays on that fixture case; it is synthetic data.
- With DocuSeal keys and a mapped template, the start creates one Test Mode submission (free, no cleanup needed). Its connection row is removed with the probe request.
