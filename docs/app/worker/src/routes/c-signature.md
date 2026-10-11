# `app/worker/src/routes/c-signature.ts`

`cSignatureRoute`, mounted at `/api/c` in `index.ts`. One route: `POST /items/:itemId/signature/start` (cookie session, `X-Requested-With: ResSpark`, no body).

## Gate order (cheapest and least revealing first)

| Step | Failure |
|------|---------|
| cookie session | 401 `no_session` |
| header | 403 `bad_origin` |
| item belongs to the session's request | 404 `not_found` |
| `item.kind === 'signature'` | 409 `item_kind_mismatch` |
| `isEsignTemplateKey(config.template)` (D-01) | 409 `bad_template` |
| `docusealConfigured` (D-10) | 503 `provider_not_configured` |
| firm mapping has a template id (D-11) | 503 `template_not_mapped` |
| `hasConsent(link, 'esign', 'esign-v1')` (D-16) | 409 `consent_required` |
| `allowInWindow('sign:' + linkId, 10, 60_000)` | 429 `rate_limited` |
| item not approved | 409 `item_approved` |
| request and case load | 404 `not_found` |
| `startSignature` | 503 `template_invalid` (one-role contract), 502 `provider_error` (any `ProviderError`) |

Success: 200 `{ connection_id, embed_src }` or 200 `{ connection_id, signed: true }`. The body is built from explicit fields, so `reused` never leaks.

Configured and mapped run **before** consent: an unconfigured firm never asks the client to agree to something that cannot happen. Consent runs before any DocuSeal call (T-06-08).

The case comes from `getRequest` (Phase 2 request bundle, which also gives `contact_email`) and the confirmed address from `getCaseAddress` (Plan 06-01); an unconfirmed address is not prefilled.

## Tests

Unit tests: see [`c-signature.test.md`](c-signature.test.md). The live path is proven by `app/worker/test/esign-start.test.ts`. The unit tests pin that `hasConsent` is never called while the provider is unconfigured or the template is unmapped, which is why those two gates sit before consent.
