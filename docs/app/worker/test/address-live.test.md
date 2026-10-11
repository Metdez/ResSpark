# `app/worker/test/address-live.test.ts`

Live proof of ADDR-01's server half against the real Supabase project, with Smarty stubbed by `stubVendorFetch`, so no Smarty account is needed. Skips with a printed reason when `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or `CLIENT_LINK_HMAC_KEY` is absent. Run it with `pnpm -C app run test:live:file worker/test/address-live.test.ts`; it is also part of `pnpm -C app test:live`.

- Env: the live Supabase values plus `SMARTY_AUTH_ID: 'test-id'` and `SMARTY_AUTH_TOKEN: 'test-token'`.
- Stubs: Autocomplete Pro answers with `fixtures/smarty/autocomplete.json`, US Street with `fixtures/smarty/street_y.json`. `stub.calls` records each request.
- `beforeAll`: `seedPortalItems({ kinds: ['address'] })` and the cookie exchange. `afterAll`: restore `fetch`, then `cleanup()`.
- Helpers: `post` (cookie plus `X-Requested-With`), `caseRow`, `confirmedEvents`.

## Tests
1. **Suggest**: 200 with two suggestions that have exactly the six keys. The Smarty call carried `Authorization: Basic base64(test-id:test-token)`, `prefer_geolocation=none`, `max_results=5`, and no `auth-token` query parameter.
2. **Confirm**: a POST with the first suggestion → 200 `{ verified: true, dpv: 'Y', needs_unit: false, item_status: 'submitted' }` and no `county` in the body. The US Street call used `candidates=1`, `match=invalid`, and separate component fields. The case row holds the USPS line, `zip4 1351`, `Santa Clara`/`06085`, `Commercial`, DPV `Y`, verified, source `smarty`, a confirm time, and `address_line2` NULL. The item is `submitted`. There is exactly one `address.confirmed` event; its payload keys are `county_fips, rdi, source, verified`, and its JSON has no `Amphitheatre` or `94043`. The POST latency is printed.
