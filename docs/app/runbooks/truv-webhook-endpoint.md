# Runbook: Truv webhook endpoint disabled

Truv sends payroll order events to `https://resspark.zh-a16.workers.dev/api/webhooks/truv`. Truv can switch that endpoint off without telling the app (RESEARCH Pitfall 3, WEBH-02).

## Symptoms

- Payroll connections stay `pending` or `connected` even though clients say they finished in Truv Bridge.
- For a day or more, `public.webhook_events` has no new rows with `provider = 'truv'`:

  ```sql
  select max(received_at) from public.webhook_events where provider = 'truv';
  ```

- The Truv account owner got an email that the endpoint is failing.

## Cause: the disable rule

- Truv expects a 2xx within 10 seconds. It retries a 4xx or 5xx three times, 30 seconds apart.
- After one full day with no 2xx, Truv emails the account owner.
- If the endpoint is still failing three days after that email, Truv **disables** it and stops delivery.
- Truv does not replay events sent while the endpoint is disabled.
- Truv never re-enables the endpoint by itself.

The route answers 401 only for a bad signature. It answers 200 for duplicates and ignored events, so a healthy deploy never trips the rule. A deploy that returns 500 for a day can.

## Check

Use the Truv Sandbox keys. Send them as headers only, and never paste them into a ticket or chat:

```bash
curl -s https://prod.truv.com/v1/webhooks/ \
  -H "X-Access-Client-Id: <TRUV_CLIENT_ID>" \
  -H "X-Access-Secret: <TRUV_SECRET>"
```

`GET /v1/webhooks/` lists the endpoints. Find the entry whose URL is ours. Confirm that `env_type` is `sandbox` (production only after Phase 8) and that the endpoint is enabled. Also check that it subscribes to `task-status-updated` and `order-status-updated`.

You can also check in Dashboard → Development → Web Hooks.

## Fix

1. First fix whatever made the route fail. Run `node app/scripts/smoke.mjs https://resspark.zh-a16.workers.dev`. It must print `ok webhooks truv 401`.
2. Re-enable the endpoint with `PATCH /v1/webhooks/{id}/`, using the same two headers and the id from the list:

   ```bash
   curl -s -X PATCH https://prod.truv.com/v1/webhooks/<id>/ \
     -H "X-Access-Client-Id: <TRUV_CLIENT_ID>" \
     -H "X-Access-Secret: <TRUV_SECRET>" \
     -H "content-type: application/json" \
     -d '{"status": "enabled"}'
   ```

   Or use Dashboard → Development → Web Hooks and turn the endpoint back on. Before using the PATCH body above, confirm the field name against Truv's `webhooks_partial_update` reference. If in doubt, use the Dashboard.
3. Run `GET /v1/webhooks/` again and confirm the endpoint is enabled.

## Why nothing is lost

Webhooks only make updates arrive sooner. The cron reconciler (`*/15 * * * *`, `app/worker/src/cron.ts`) re-reads every non-terminal connection every 15 minutes through the same `reconcileConnection` the webhook path uses. For Truv that means `GET /v1/orders/{id}/`. While the endpoint is disabled, payroll connections still reach `done`; they just lag by up to 15 minutes. Staff can press `Refresh` on the payroll card to reconcile on demand. Events Truv did not replay never need to be replayed, because their state is read straight from the order.
