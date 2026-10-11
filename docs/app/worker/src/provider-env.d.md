# `app/worker/src/provider-env.d.ts`

Global declaration merge onto the Wrangler-generated `Env` interface: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `TRUV_CLIENT_ID`, `TRUV_SECRET`, and (Plan 06-01) `SMARTY_AUTH_ID`, `SMARTY_AUTH_TOKEN`, `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`, all optional strings. Without the Smarty pair the address routes answer 503 `provider_not_configured` and the client types the address by hand (D-06); without the DocuSeal pair e-sign stays unavailable. `PLAID_ENV` was removed in Plan 04-02: it is now a `wrangler.jsonc` var (`"sandbox"`), so `cf-typegen` emits it as a required `string`.

These are optional Worker secrets (D-15): they are deliberately not in `wrangler.jsonc` `secrets.required`, so the Worker deploys and serves the manual-upload fallback before the vendor keys exist, and `wrangler types` does not emit them. Adapters read them as possibly `undefined` (`truvConfigured`, `plaidAdapter.configured`).

The file is a script (no imports or exports), so its `interface Env` merges with the global one. If Plan 02's `cf-typegen` starts emitting any of these names (for example `PLAID_ENV` as a var), delete that member here, or TypeScript reports a conflicting declaration.
