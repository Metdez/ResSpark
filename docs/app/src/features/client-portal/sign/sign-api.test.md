# `app/src/features/client-portal/sign/sign-api.test.ts`

Web project (jsdom). `reply(status, body)` stubs `fetch` with one answer; `afterEach` removes the stub.

1. `startSigning('I1')` POSTs `/api/c/items/I1/signature/start` with `X-Requested-With: ResSpark`.
2. An `embed_src` reply maps to `{ kind: 'embed', connectionId: 'C1', embedSrc }`.
3. `signed: true` maps to `{ kind: 'signed', connectionId: 'C1' }`.
4. Three hostile `embed_src` values (another host, `http:`, a look-alike host) reject with `{ status: 500, code: 'invalid_response' }`.
5. A 409 envelope becomes `PortalError(409, 'consent_required')`.
6. `isStartResponse` accepts the two good shapes and rejects a bare id, a missing id, and `null`.
