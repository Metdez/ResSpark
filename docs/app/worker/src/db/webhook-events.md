# `app/worker/src/db/webhook-events.ts`

Data access for the `webhook_events` ledger (migration 0005, D-01).

| Export | What it does |
|--------|--------------|
| `WebhookProvider`, `WebhookEventRow` | Mirror the table columns used by the consumer. |
| `recordWebhook(env, provider, eventKey, payload)` | `upsert(..., { onConflict: 'provider,event_key', ignoreDuplicates: true }).select('id').maybeSingle()`. PostgREST turns this into `INSERT ... ON CONFLICT DO NOTHING RETURNING id`: a first delivery returns the new id; a duplicate returns no row, so the function returns `null` and the route answers 200 without enqueueing. Observed live in `connections-tracer.test.ts`. Throws `webhook_record_failed` on any other error. |
| `getWebhookEvent(env, id)` | Row or `null`. |
| `markWebhookEvent(env, id, status, lastError?)` | Sets `status` and `last_error`. `processing` also increments `attempts` (read then write; the `shortcut:` comment notes a lost increment only skews the counter). `done`, `ignored`, `dead` also set `processed_at`. |
| `_setDefaultFirmIdForTests(id)` | Test seam: live tests point unverifiable-webhook events at the test firm. |
| `defaultFirmId(env)` | Firm that owns `webhook.rejected` events: the test override, else the first firm by id. `shortcut:` events are firm-scoped and an unverifiable webhook has no firm; v1 is single-firm. Upgrade by giving each firm its own webhook path. |
