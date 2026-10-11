# `app/worker/src/integrations/provider-error.ts`

The two error classes the queue consumer branches on.

- `ProviderError(provider, status, code, transient, message?)`: a vendor call failed. `status` is the HTTP status, or `null` when no response arrived. `code` is a short token (the vendor's error code or `http_<status>`, `network`, `bad_response`, `provider_not_configured`). `transient` decides whether the consumer retries with backoff or dead-letters. Fields are explicit `readonly` properties.
- `isTransientStatus(status)`: `null` (network), 429 and 5xx are transient; every other status is permanent.
- `NonRetryableError(code, message?)`: a job that can never succeed by retrying (missing row, unsupported kind, unknown job). The consumer acks it and records the code. Lives here, next to `ProviderError`, so `jobs/reconcile.ts` and `jobs/index.ts` share it without an import cycle; `jobs/index.ts` re-exports it.
