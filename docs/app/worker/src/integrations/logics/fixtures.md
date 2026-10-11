# `app/worker/src/integrations/logics/fixtures.ts`

The fake Logics tenant used when `LOGICS_MODE=fake`. It lets the lookup flow run end to end with no Logics credentials (the Oct 12 demo), and it can never reach the real ValorTax tenant (C1).

| Lines | What it does |
|-------|--------------|
| 1 | Imports the `LogicsClient` interface and the two row types. |
| 3-4 | The privacy rule: only `example.com` emails and `555-010-xxxx` numbers, so a demo screenshot cannot show a real person. |
| 5-66 | `FAKE_CASES`: four synthetic rows in the documented Find shape (see table below). |
| 68 | `digits`: strips every non-digit so phone comparison ignores formatting. |
| 70-73 | `hasPhone`: true when the wanted digits equal the digits of `CellPhone`, `HomePhone`, or `WorkPhone`. An empty search never matches. |
| 75-92 | `createFakeLogicsClient`: the same four operations as the live client. Phone matching is by digits only, email matching is trimmed and case-insensitive, last name is case-insensitive and combined with phone. `caseInfo` reshapes the row to the CaseInfo contract (`Status` instead of `StatusID`, no `CreatedDate`) so the mapper sees the same shape it gets from Logics. No network, no delay. |

## Fixture cases

| CaseID | Name | Phone field | Email | StatusID | CreatedDate |
|--------|------|-------------|-------|----------|-------------|
| 900001 | Jordan Rivera | Cell `(555)010-0001` | jordan.rivera@example.com | 191 | 2026-08-14T15:02:11 |
| 900002 | Casey Rivera | Home `5550100001` | casey.rivera@example.com | 191 | 2026-09-02T09:30:00 |
| 900003 | Morgan Lee | Cell `(555)010-0003` | morgan.lee@example.com | 120 | 2026-07-01T12:00:00 |
| 900004 | Taylor Brooks | Work `5550100004` | taylor.brooks@example.com | 205 | 2026-09-20T08:15:00 |

900001 and 900002 share a phone number stored in two different formats. A search for that number returns two cards (LOOK-02).

## Tests

Exercised through `lookup.test.ts` (multi-match ordering, last-name narrowing, email case folding, case id hit and miss, `fetchCaseSummary`) and `config.test.ts` (fake mode resolves to this client).
