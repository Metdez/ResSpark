# `app/worker/test/connections-ops-live.test.ts`

Live suite. It is skipped when `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing. Run it with `pnpm -C app test:live:file worker/test/connections-ops-live.test.ts`.

Setup and cleanup:

- Seeds one bank request through `fixtures/connections.ts`, under the test firm `...000e`.
- Inserts connections with back-dated timestamps. Where an access token should exist, it also inserts a dummy `connection_secrets` row.
- `afterAll` deletes all of it. The secrets rows are removed along with their connections.

Other suites may own rows that match the same queries, so each assertion checks only this suite's own ids.

## Cron queries

| Fixture name | Shape | Expected |
|--------------|-------|----------|
| `stalePolled` | connected, polled 20 min ago | stale |
| `liveLink` | pending, created 1 h ago, never polled | stale, not expired |
| `freshPolled` | polled 2 min ago | not stale |
| `freshWebhook` | polled 20 min ago, webhook 2 min ago | not stale (the latest activity counts) |
| `tooOld` | created 20 days ago | not stale |
| `terminal` | done | not stale |
| `deadLink` | pending bank, 7 h old, no secret | expired |
| `pendingWithToken` | pending bank, 7 h old, has a secret | not expired |
| `dueOlder`, `dueNow` | Plaid, `remove_after` 2 days ago and 1 s ago, with a secret | removal candidates, `dueOlder` first |
| `notDue`, `dueNoSecret`, `dueRemoved`, `dueTruv` | future date / no secret / already removed / Truv | not candidates |
