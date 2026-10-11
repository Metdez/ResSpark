# `app/worker/src/financials/propose/run.ts`

The `financials_propose` queue job (D-07). It recomputes the proposals of every source for one case. The job is idempotent: `financial_proposals_upsert` keeps identical rows and supersedes stale ones, so a retry or a second trigger changes nothing.

| Part | What it does |
|------|--------------|
| `GENERATOR_VERSION` | `'p7-1'`. This is stamped on every proposal row. Bump it when a proposer's logic changes, so old rows are recognisable. |
| `ProposeContext` | What a proposer receives: `env`, `firmId`, `caseId`, `caseRow` (the case id, firm, `logics_case_id`, `financials_settings` and the `ADDRESS_COLUMNS`), `settings` (from `settingsOf`), `window` (from `completeMonthsWindow(now, settings.window_months)`), `now`, and `logicsCaseInfo()`. |
| `logicsCaseInfo()` | A memoized read of Logics `Case/CaseInfo` for the case. It returns `null` when the case has no `logics_case_id`. Both the `logics` proposer and the address fallback share the one read. |
| `Proposer` | `(ctx) => Promise<{ source, proposals } | null>`. `null` means the proposer could not run, so the old rows of that source are kept. `[]` means it ran and found nothing, so the old rows of that source are superseded. A proposer never proposes from absence. |
| `PROPOSERS` | A record from a name to a proposer. The name keys the job result and the `financials.propose_failed` payload. Key order is run order. It holds `address` (`proposeAddress`), `logics` (`proposeLogics`), `bank` (`proposeBank`, the `plaid` source, see `bank.md`) and `payroll` (`proposePayroll`, the `truv` source, see `payroll.md`). |
| `isTransient(e)` | `true` for a transient `ProviderError` (network, 429, 5xx) and for `LogicsError` `network` or `upstream`. `jobs/index.ts` uses it too, so the queue retries those errors with backoff. |
| `codeOf(e)` | Turns an error into a loggable code made of our own tokens: `ProviderError.code`, `NonRetryableError.code`, `logics_<kind>`, a snake_case message, or `internal`. |
| `readCaseInfo(env, firmId, logicsCaseId)` | Returns `null` without a Logics id. Otherwise it calls `resolveLogicsClient(env, await getIntegration(env, firmId, 'logics'))`, which uses the fixtures in fake mode, and then `client.caseInfo(id)`. `LogicsError('not_configured')` becomes `null`. Other Logics errors propagate to the proposer. The row is re-read on every run and only kept in memory (Phase 2 C8/M6). |
| `runFinancialsPropose(env, caseId, now?)` | Loads the case with the admin client. A missing case throws `NonRetryableError('case_missing')`. It builds the context and runs each proposer in order, and returns `{ [name]: { inserted, kept, superseded } | 'skipped' | 'failed' }`. |

## Error handling per source

- A proposer returns `null`: the result is `'skipped'`, and nothing is written.
- A proposer returns proposals: `upsertProposals(env, { firmId, caseId, source, generatorVersion, proposals, scopeColumns: null })` runs, with the system as the actor.
- A transient error: the result is `'failed'`. The first such error is kept and thrown again after the loop, so the queue retries the whole job. The other sources still run first.
- Any other error: the result is `'failed'`, and the job writes `financials.propose_failed { source, code }` through `logEvent` with actor `system`. The other sources still run.
