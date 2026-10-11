# Runbook: Plaid and Truv sandbox rehearsal (before the demo)

The unit tests and recorded fixtures cannot produce a real Plaid-signed `SESSION_FINISHED` webhook. Plaid's `/sandbox/item/fire_webhook` cannot fire it (RESEARCH Pitfall 2), and it cannot fire `STATEMENTS_REFRESH_COMPLETE` either. This checklist is the one human run that proves the real path against the deployed Worker. Use Sandbox keys and a synthetic fixture case only.

**Status as of 2026-10-11:** blocked-pending-user. `pnpm -C app wrangler secret list` shows no `PLAID_*` or `TRUV_*` names. Do steps 1-4 of § USER ACTION REQUIRED (Phase 4) in `docs/app/README.md` first.

Run date: ____________ Operator: ____________ Worker version: ____________

## Plaid half

| Step | Expected | Observed | Pass |
|------|----------|----------|------|
| 1. `pnpm -C app wrangler secret list` | Lists `PLAID_CLIENT_ID`, `PLAID_SECRET`, `TRUV_CLIENT_ID`, `TRUV_SECRET`, and `TOKEN_ENC_KEY_1` (names only) | | |
| 2. `pnpm -C app run smoke:connect https://resspark.zh-a16.workers.dev` | Ends `ok connect-flow complete (keys: payroll yes, bank yes)` | | |
| 3. In admin, create a `Standard resolution packet` request for a fixture case and send it. Open the link in a fresh phone-sized private window and tap `Start` | The step list shows `Connect your bank` | | |
| 4. `View` → `Connect bank` → `I agree` | Hosted Link opens on `secure.plaid.com` in the same tab | | |
| 5. First Platypus Bank → `user_good` / `pass_good` → code `1234` | Plaid completes and redirects to `/c/return` | | |
| 6. Return page | Shows `Checking your connection…`, then the step list | | |
| 7. Within 60 s, `GET /api/admin/requests/<id>/connections` (or the admin `Bank` card) | Bank connection is `connected` or `syncing` | | |
| 8. Within 60 s, `select event_key, status from public.webhook_events where provider = 'plaid' order by received_at desc limit 5;` | A row whose `event_key` ends `:SESSION_FINISHED`. This is the one real Plaid signature check | | |
| 9. Within 10 minutes, the admin `Bank` card | `Done`, at least 1 `Statement` cell for First Platypus Bank, transactions count > 0 | | |
| 10. Click `Refresh` on the `Bank` card | 200; the card shows the same result | | |

`node app/scripts/plaid-fire-webhook.mjs` is not part of this phase. If you need a `SYNC_UPDATES_AVAILABLE` webhook, fire it from the sandbox tools in the Plaid Dashboard.

## Truv half

| Step | Expected | Observed | Pass |
|------|----------|----------|------|
| 11. Same link: `View` on `Connect your payroll` → `Connect payroll` → `I agree` | Truv Bridge opens inside the portal | | |
| 12. Search for an employer, then sign in with `multiple.employments` / `goodpassword` | Bridge reaches `COMPLETED`; the sheet lists two employers | | |
| 13. Admin `Payroll` card | `Done` with pay stubs and a W-2 for each employer | | |
| 14. Review panel, under the payroll item | The same pay stubs and W-2s are listed | | |
| 15. `select event_key, status, received_at from public.webhook_events where provider = 'truv' order by received_at desc limit 5;` | New rows received during this session (`event_key` is Truv's `webhook_id`). If none appear, see [truv-webhook-endpoint.md](truv-webhook-endpoint.md) | | |

## Phone layout

| Step | Expected | Observed | Pass |
|------|----------|----------|------|
| 16. 320 px viewport at 200 % zoom: payroll sheet, bank sheet, return page | No horizontal scroll; every button is at least 44 px; the `Upload … instead` fallback is visible in every state | | |

## Result

Copy the run date, the Pass count, and the `SESSION_FINISHED` `event_key` into the Phase 4 verification notes.
