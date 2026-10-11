# `app/worker/test/esign-settings-live.test.ts`

Live test (worker-node, runs under `pnpm -C app test:live`) for `setEsignMapping` and `getEsignMapping` against the real Supabase project. Skipped with a stderr note when `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, or `CLIENT_LINK_HMAC_KEY` is missing (`liveEnvOrSkip`).

- Touches only the test firm `00000000-0000-0000-0000-00000000000e` (upserted if absent).
- `beforeAll`: saves the firm's current `settings`, replaces them with `{ keep_me: 1 }`, and records the highest event id so only new events are counted.
- `afterAll`: restores the saved `settings`. The event the test logs stays, because `events` is append-only.
- The one case: `setEsignMapping(..., { engagement_letter: 1001 }, actor)` returns `{ engagement_letter: 1001, form_2848: null, form_8821: null }`; `settings.keep_me` is still `1`; exactly one new `settings.esign_templates_updated` event exists for the firm, with payload `{ keys: ['engagement_letter'] }`; `getEsignMapping` returns the same mapping.
