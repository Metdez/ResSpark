# `app/worker/src/integrations/logics/fixtures.ts`

The fake Logics tenant used when `LOGICS_MODE=fake`. It lets the lookup flow run end to end with no Logics credentials (the Oct 12 demo), and it can never reach the real ValorTax tenant (C1).

| Lines | What it does |
|-------|--------------|
| 1-2 | Imports the `LogicsClient` interface and the two row types, plus `LOGICS_MAX_PART_BYTES` and `FakeWriteOptions` from `write-types.ts` (Phase 5). |
| 3-4 | The privacy rule: only `example.com` emails and `555-010-xxxx` numbers, so a demo screenshot cannot show a real person. |
| 5-66 | `FAKE_CASES`: four synthetic rows in the documented Find shape (see table below). |
| after `FAKE_CASES` | `FAKE_CASE_INFO_EXTRAS`: CaseInfo-only fields per case id (Phase 7 Plan 05). 900001 gets `DOB '07/24/1980'`, `MaritalStatus 'Married'`, `TaxLiability '$18,450.00'`, `Address '100 Congress Ave'` and `AptNo ''`, the field names and formats of the documented CaseInfo response. They are synthetic. The `find*` rows never include them, so the Phase 2 lookup cards and the mapper output stay unchanged. |
| next | `digits`: strips every non-digit so phone comparison ignores formatting. |
| 70-73 | `hasPhone`: true when the wanted digits equal the digits of `CellPhone`, `HomePhone`, or `WorkPhone`. An empty search never matches. |
| after `hasPhone` | `FAKE_FAILURES`: the non-`sent` outcomes a test can inject, each exactly what the live client returns for that case: `unknown` → `{ kind: 'unknown', code: 'logics_no_response' }`, `auth` → `failed` 401 `logics_auth`, `scope` → `failed` 403 `logics_scope`, `rejected` → `failed` 400 `logics_rejected_400`. `randomId(base, span)`: a synthetic positive integer id. |
| `createFakeLogicsClient(opts)` writes (Phase 5, D-10) | `opts.outcome` (default `sent`) and `opts.delayMs` (default 300). `createCaseDocument` applies the same size gate as the live client first (over 5,767,168 bytes → `failed` status 0 `size_gate`, no delay), then waits and returns `{ kind: 'sent', logicsDocumentId: 100000..999999 }` or the injected failure. `createActivity` waits and returns `{ kind: 'sent', activityId: 9000000..9899999 }` or the injected failure. `listActivities` returns `{ activityTypes: ['General', 'Document sent'] }`. None of them calls `fetch`, so fake mode can never open a socket to a Logics host. The push consumer always builds this client with no options; tests inject outcomes through the options, never through env. |
| `createFakeLogicsClient(opts)` reads | the same four read operations as the live client. Phone matching is by digits only, email matching is trimmed and case-insensitive, last name is case-insensitive and combined with phone. `caseInfo` reshapes the row to the CaseInfo contract (`Status` instead of `StatusID`, no `CreatedDate`) and merges that case's `FAKE_CASE_INFO_EXTRAS` so the mapper sees the same shape it gets from Logics. No network, no delay. |

## Fixture cases

| CaseID | Name | Phone field | Email | StatusID | CreatedDate |
|--------|------|-------------|-------|----------|-------------|
| 900001 | Jordan Rivera | Cell `(555)010-0001` | jordan.rivera@example.com | 191 | 2026-08-14T15:02:11 |
| 900002 | Casey Rivera | Home `5550100001` | casey.rivera@example.com | 191 | 2026-09-02T09:30:00 |
| 900003 | Morgan Lee | Cell `(555)010-0003` | morgan.lee@example.com | 120 | 2026-07-01T12:00:00 |
| 900004 | Taylor Brooks | Work `5550100004` | taylor.brooks@example.com | 205 | 2026-09-20T08:15:00 |

900001 and 900002 share a phone number stored in two different formats. A search for that number returns two cards (LOOK-02).

## Tests

Write methods: exercised live by `worker/test/logics-push.test.ts` (fake-mode push end to end) and in `jobs/logics-push-finalize.test.ts`.

The extras are read by the Logics proposer in `worker/test/financials-propose.test.ts` (live, fake mode). Exercised through `lookup.test.ts` (multi-match ordering, last-name narrowing, email case folding, case id hit and miss, `fetchCaseSummary`) and `config.test.ts` (fake mode resolves to this client).
