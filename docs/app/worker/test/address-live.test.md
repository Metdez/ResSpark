# `app/worker/test/address-live.test.ts`

Live proof of ADDR-01's server half against the real Supabase project, with Smarty stubbed by `stubVendorFetch`, so no Smarty account is needed. Skips with a printed reason when `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or `CLIENT_LINK_HMAC_KEY` is absent. Run it with `pnpm -C app run test:live:file worker/test/address-live.test.ts`; it is also part of `pnpm -C app test:live`.

- Env: the live Supabase values plus `SMARTY_AUTH_ID: 'test-id'` and `SMARTY_AUTH_TOKEN: 'test-token'`.
- Stubs: Autocomplete Pro answers with `fixtures/smarty/autocomplete.json`, US Street with `fixtures/smarty/street_y.json`. `stub.calls` records each request.
- `beforeAll`: two `seedPortalItems({ kinds: ['address'] })` fixtures (`fx`, used through the cookie, and `other`, used for the cross-link and revoked-link guards) and the cookie exchange for `fx`. `afterAll`: restore `fetch`, then clean up both.
- Helpers: `post` (cookie plus `X-Requested-With`), `caseRow`, `confirmedEvents`, `rpcConfirm` (calls `case_confirm_address` directly with the service key, for guards the route never lets through), and `SMARTY` (a full verified payload with `line2: ''`).

## Tests
1. **Suggest**: 200 with two suggestions that have exactly the six keys. The Smarty call carried `Authorization: Basic base64(test-id:test-token)`, `prefer_geolocation=none`, `max_results=5`, and no `auth-token` query parameter.
2. **Confirm**: a POST with the first suggestion → 200 `{ verified: true, dpv: 'Y', needs_unit: false, item_status: 'submitted' }` and no `county` in the body. The US Street call used `candidates=1`, `match=invalid`, and separate component fields. The case row holds the USPS line, `zip4 1351`, `Santa Clara`/`06085`, `Commercial`, DPV `Y`, verified, source `smarty`, a confirm time, and `address_line2` NULL. The item is `submitted`. There is exactly one `address.confirmed` event; its payload keys are `county_fips, rdi, source, verified`, and its JSON has no `Amphitheatre` or `94043`. The POST latency is printed.
3. **Blank line2**: an RPC smarty payload with `line2: ''` stores `address_line2` NULL.
4. **Manual re-confirm**: a manual POST on the `submitted` item replaces the address (`Apt 4` as line 2), sets `zip4`, county, FIPS, RDI, and DPV to NULL, `address_verified false`, source `manual`, and logs one more `address.confirmed` with payload `{ source: 'manual', verified: false, county_fips: null, rdi: null }`.
5. **bad_address**: a manual RPC payload carrying a county FIPS is refused.
6. **item_not_found**: `fx`'s item with `other`'s link is refused.
7. **link_inactive**: after `other`'s link is revoked, its own item is refused.
8. **item_approved**: after `item_approve`, the route answers 409 `item_approved`, the RPC raises `item_approved`, and the case row is unchanged.
9. **Publishable key refused** (T-06-05; skipped when no publishable key is in the env): `anon.rpc('case_confirm_address', …)` returns no data and 401 / `42501`, proving the EXECUTE grant is revoked from anon. It lives here rather than in `phase3-anon.test.ts`, which belongs to Phase 3.
