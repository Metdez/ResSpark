# `app/worker/src/routes/c-signature.test.ts`

Unit tests for `POST /api/c/items/:itemId/signature/start` through `app.request` (no network). `db/case-address`, `db/consents`, `db/documents`, `db/esign-settings` and `db/requests` are auto-mocked; `startSignature` is mocked while `TemplateInvalidError` stays real; `clientSession` sets link `L1`, request `R1`, firm `F1`; `requireClientHeader` stays real. Defaults: a pending `signature` item with `engagement_letter`, mapping `1001`, consent present, a request bundle with contact email, no confirmed address. The rate limiter resets before each test.

| Test | Expected |
|------|----------|
| no header | 403 |
| another request's item | 404 |
| `upload` item | 409 `item_kind_mismatch` |
| `form_433a` template | 409 `bad_template` |
| no API key | 503 `provider_not_configured`, `hasConsent` not called |
| mapping null | 503 `template_not_mapped`, `hasConsent` not called |
| no consent | 409 `consent_required`, checked as `('L1', 'esign', 'esign-v1')`, `startSignature` not called |
| 11 starts in a minute | ten 200, then 429 `rate_limited` |
| approved item | 409 `item_approved` |
| `ProviderError` | 502 `provider_error` |
| `TemplateInvalidError` | 503 `template_invalid` |
| success | body exactly `{ connection_id, embed_src }` (no `reused`); mapped id, key and contact email passed through |
| signed | body exactly `{ connection_id, signed: true }` |
