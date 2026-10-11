# `app/e2e/portal-mock.ts`

In-browser fake of the client portal API for the signing path, used by `e2e/sign-taps.spec.ts`.

## Exports

- `SIG_ID`: the signature step's id, a UUID (`3f2504e0-…`) so it survives `validateSearch` in `/c/?step=`.
- `EMBED_SRC`: `https://docuseal.com/s/fakeSlug`, the `embed_src` the fake start returns.
- `MockOptions`: `opened` (the link was already opened, so the step list shows at once), `consented` (an `esign` consent already exists), `configured` (`false` makes the start route answer 503).
- `mockPortal(page, opts)`: installs two `page.route` handlers and returns the array it records calls into (`"METHOD /path"`).

## Routes

- `https://cdn.docuseal.com/js/form.js` → `FAKE_FORM_JS` as `application/javascript`.
- `**/api/c/**`, keyed by method and path:

| Call | Answer |
|---|---|
| `GET /api/c/state` | firm ValorTax, agent Andrew, `opened_at` (null until Start unless `opened`), one `signature` step "Sign your engagement letter" that turns `submitted` after reconcile |
| `POST /api/c/start` | sets and returns `opened_at` |
| `POST /api/c/heartbeat` | `{ ok: true }` |
| `POST /api/c/consents` | records the consent, `{ ok: true }` |
| `POST /api/c/items/<SIG_ID>/signature/start` | 503 `provider_not_configured` when `configured === false`; 409 `consent_required` until a consent is posted (or `consented`); otherwise `{ connection_id: 'C1', embed_src: EMBED_SRC }` |
| `POST /api/c/connections/C1/reconcile` | marks the step signed, 202 |
| anything else | `route.continue()` to the dev server |

Error bodies use the Worker's envelope `{ error: { code, message } }`. State is per call to `mockPortal`, so each test starts fresh.
