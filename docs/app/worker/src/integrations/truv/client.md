# `app/worker/src/integrations/truv/client.ts`

Minimal Truv HTTP client.

- `TRUV_BASE` = `https://prod.truv.com/v1`. Truv uses one host for every environment; the Access Secret selects sandbox, development or production.
- `truvConfigured(env)`: both `TRUV_CLIENT_ID` and `TRUV_SECRET` are set. These are optional secrets (D-15), so a deploy without them still works.
- `truvFetch(env, path, { method, body }, guard?)`:
  - not configured → `ProviderError('truv', null, 'provider_not_configured', false)`;
  - sends `X-Access-Client-Id`, `X-Access-Secret`, `Content-Type` and `Accept: application/json`; a JSON body when given;
  - a thrown fetch (network) → transient `ProviderError(…, 'network', true)`;
  - non-2xx → `ProviderError` with `body.error.code` or `http_<status>`, transient for 429/5xx;
  - a failing `guard` → permanent `bad_response`;
  - otherwise returns the parsed body.

Response bodies and headers are never logged; they carry client PII and bridge tokens.
