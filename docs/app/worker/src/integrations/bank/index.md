# app/worker/src/integrations/bank/index.ts

The bank provider selector (D-11, BANK-04).

| Part | What it does |
|------|--------------|
| `plaidConfigured(env)` | True when both `PLAID_CLIENT_ID` and `PLAID_SECRET` are set. |
| `bankProvider(env, id?)` | Returns the `BankProvider` for `id`, or for `env.BANK_PROVIDER` when no id is given (a stored connection passes its own `provider`). `plaid` returns `plaidProvider`. Anything else, including `teller` until Phase 8, throws `NonRetryableError('unknown_provider')`, so a queued job acks instead of retrying. |

This is the one place a bank provider id is read. Callers decide flow and UI from `provider.capabilities` (`transactions`, `statementPdfs`, `hostedLink`), so adding Teller is a new entry here plus its implementation.
