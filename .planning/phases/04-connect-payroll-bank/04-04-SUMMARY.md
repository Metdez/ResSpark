---
phase: 04-connect-payroll-bank
plan: 04
subsystem: worker/bank
tags: [plaid, hosted-link, token-vault, transactions-sync, statements, retention]
requires: [04-01, 04-02, 04-03]
provides: [bankProvider, plaidProvider, sealToken/openToken, startBank, cReturnRoute, reconcileBank, syncStatements, removeItem, statements-manual-route]
affects: [04-05, 04-06, 04-07]
key-files:
  created: [app/worker/src/integrations/token-vault.ts, app/worker/src/integrations/bank/{index,start}.ts, app/worker/src/integrations/bank/plaid/{client,link,transactions,statements,index}.ts, app/worker/src/db/bank.ts, app/worker/src/jobs/{bank-reconcile,bank-statements,remove-items}.ts, app/worker/src/routes/c-return.ts, app/worker/test/{bank-complete,bank-statements,remove-items}.test.ts]
  modified: [app/worker/src/integrations/bank/provider.ts, app/worker/src/jobs/{reconcile,index}.ts, app/worker/src/routes/c-connections.ts, app/worker/src/webhooks/plaid.ts, app/worker/src/index.ts]
decisions:
  - "BankProvider.createLinkSession takes requestId (client_user_id) and syncTransactions returns statusRaw (stored as data.transactions_update_status)"
  - "connection_set_status only moves forward by rank, so ITEM_LOGIN_REQUIRED on a done connection keeps done"
status: complete
metrics: { duration: 40m, completed: 2026-10-11 }
actuals: { tokens: 62000, tasks: 3, commits: 3 }
plan_head_before: 1c133d2140e2a88c4da06adfed5ab8297f8fb848
plan_head_after: 0541ee5
---

# Phase 4 Plan 04: Plaid bank vertical Summary

The server side of the Plaid bank flow now runs behind `BankProvider`. Each tap creates a Hosted Link from a row that already exists. `/c/return` uses a single-use nonce and only queues a reconcile. A verified `SESSION_FINISHED` (or `/link/token/get` when the webhook was missed) exchanges the token into an AES-GCM vault with AAD = connection id. From there: the `/transactions/sync` cursor loop, hash-checked statement PDFs with month cells per account, manual attribution, and daily Item removal. All three tasks are proven live with only Plaid stubbed.

## Commits
- b142aeb Task 1: token vault, Plaid client/link, startBank, /c/return, completion half, bank-complete live test
- a638cd2 Task 2: sync loop, statements + month cells, connected half, bank-statements live test
- 0541ee5 Task 3: removeItem + consumer, manual attribution route, unit tests, remove-items live test

The ledger range `1c133d2..HEAD` counts 21 commits because other executors committed on `zack` during this run. 3 of them are this plan's.

## Recorded facts
- Captured `/link/token/create` body (bank-complete): `user.client_user_id` = request id, `client_name` = firm name, `country_codes ['US']`, `language 'en'`, `webhook http://localhost/api/webhooks/plaid`, `products ['transactions']`, `transactions.days_requested 365`, `required_if_supported_products ['statements']`, `statements` = today-180d..today, `hosted_link { completion_redirect_uri: http://localhost/c/return?nonce=<22 chars>, url_lifetime_seconds 1800, is_mobile_app false }`.
- `remove_after` offset: asserted at 30 days ± 1 h. The test passed; the console line with the exact value was not kept.
- Fixture pages produced 4 added and 1 removed, so 3 transactions stored. The two same-date rows are ordered by `plaid_transaction_id`.
- Statement months are pinned to the test's clock with `targetMonths(new Date(), 6)`, not hard-coded.
- Env typing: the Plaid keys are optional in `provider-env.d.ts`. `PLAID_ENV`, `BANK_PROVIDER`, `PLAID_REMOVE_AFTER_DAYS` and `TOKEN_ENC_KEY_1` come from `worker-configuration.d.ts`. The vault reads `TOKEN_ENC_KEY_<n>` by index.
- `index.ts`: `app.route('/c', cReturnRoute)` is mounted right before `app.route('/c', clientLinkRoute)`.

## Deviations
1. [Rule 3] Added `requestId` to `BankProvider.createLinkSession` and `statusRaw` to the `syncTransactions` result in `provider.ts`. Without them the D-08 body and the raw update status could not be built.
2. [Rule 1] `upsertAccounts` writes explicit columns. Statement listings carry a `statements` field that broke the insert.
3. The webhook path has no institution name (the webhook does not carry one). `institution_name` is asserted on the `/link/token/get` recovery path instead.
4. Sync and statement fixtures are inline in `bank-statements.test.ts`. The plan named JSON files; only `link_token_*`, `exchange` and `item_remove` became files. Fixture item ids are plan-unique (`item_fixture_0404_*`, `item_fixture_3`).
5. The ITEM_LOGIN_REQUIRED live case uses a fresh `connected` connection. `connection_set_status` will not move a `done` connection to `error`.
6. Lighter checks per the coordinator: no RED commits, and the full `pnpm -C app run check` ran once (green, 1372 passed) before the Task 3 commit. Not deployed; the orchestrator deploys.

## Notes
- The bank `start` gate stays `providerConfigured`. Without Plaid keys, start answers 503 `provider_not_configured`.
- Out of scope: 06-02 changed `provider.ts` (added `docuseal: null`) after my Task 2 commit. I left it uncommitted for them.

## Self-Check: PASSED
All created files exist, and commits b142aeb, a638cd2 and 0541ee5 are ancestors of HEAD.
