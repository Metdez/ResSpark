# `app/worker/test/fixtures/connections.ts`

Live-test seeding for Phase 4 connection suites. Self-contained (it does not import `fixtures/request.ts`) and writes only under the permanent test firm `00000000-0000-0000-0000-00000000000e` and its case `00000000-0000-0000-0000-0000000000e1`.

| Export | What it does |
|--------|--------------|
| `TEST_FIRM_ID`, `TEST_CASE_ID` | The test firm and case. The case is permanent because `events.case_id` has no `ON DELETE`. |
| `FIXTURE_KEY_PREFIX` | `wh_fixture_`: every fixture `webhook_id` starts with it. |
| `fixtureText(rel)` | Reads a JSON fixture under `test/fixtures/` as raw text (tests sign exact bytes; no JSON module import needed). |
| `deleteFixtureWebhooks(admin)` | Deletes `webhook_events` whose key starts with `wh_fixture_`. Called by the suite that posts fixture webhooks, before (crash leftovers) and after; not by `cleanup()`, because the ledger is not request-scoped and parallel suites would delete each other's rows. |
| `seedConnectionFixture(env, { kind })` | Upserts the test firm and case, inserts an `opened` request, one required `pending` item (`payroll_connect` or `bank_connect`), and a 14-day client link. Returns the ids, the admin client and `cleanup()`. |
| `cleanup()` | Deletes the request's connections, then the request (cascading items, links, sessions, consents). Events stay: they are append-only and under the test firm. |
