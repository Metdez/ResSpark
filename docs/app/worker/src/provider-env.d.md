# `app/worker/src/provider-env.d.ts`

Global declaration merge onto the Wrangler-generated `Env` interface: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `TRUV_CLIENT_ID`, `TRUV_SECRET`, all optional strings.

These are optional Worker secrets (D-15): they are deliberately not in `wrangler.jsonc` `secrets.required`, so the Worker deploys and serves the manual-upload fallback before the vendor keys exist, and `wrangler types` does not emit them. Adapters read them as possibly `undefined` (`truvConfigured`, `plaidAdapter.configured`).

The file is a script (no imports or exports), so its `interface Env` merges with the global one. If Plan 02's `cf-typegen` starts emitting any of these names (for example `PLAID_ENV` as a var), delete that member here, or TypeScript reports a conflicting declaration.
