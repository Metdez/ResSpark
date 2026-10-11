# `app/src/features/client-portal/sign/sign-api.ts`

Client call that starts (or resumes) signing for one signature step (Plan 06-06, SIGN-03).

- `StartResult`: either `{ kind: 'embed', connectionId, embedSrc }` (show the signing form) or `{ kind: 'signed', connectionId }` (the submitter already completed it).
- `EMBED_PREFIX = 'https://docuseal.com/s/'`: the only URL prefix the SPA ever renders (threat T-06-25). The Worker checks the same host when it reads `embed_src` from DocuSeal (Plan 06-02).
- `isStartResponse(v)`: boundary guard. Needs a string `connection_id` and either `signed: true` or a string `embed_src`. Anything else makes `portalFetch` throw `PortalError(500, 'invalid_response')`.
- `startSigning(itemId)`: `POST /api/c/items/{itemId}/signature/start` through `portalFetch`, so the `X-Requested-With: ResSpark` header, the same-origin cookie, and the `{ error: { code } }` to `PortalError(status, code)` mapping all apply. The item id goes through `encodeURIComponent`. A `signed` reply maps to the signed result. An `embed_src` that does not start with `EMBED_PREFIX` (another host, `http:`, a look-alike such as `docuseal.com.evil.example`) throws `PortalError(500, 'invalid_response')`.

Errors the page handles (from `worker/src/routes/c-signature.ts`): 409 `consent_required`, `consent_text_stale`, `item_approved`, `bad_template`; 503 `provider_not_configured`, `template_not_mapped`, `template_invalid`; 502 `provider_error`; 429 `rate_limited`; 401 when the cookie session is gone.

## Tests

See `sign-api.test.md`.
