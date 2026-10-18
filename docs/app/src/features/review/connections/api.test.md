# `app/src/features/review/connections/api.test.ts`

Unit tests for the staff connection client (`api.ts`). `fetch` is stubbed with `vi.stubGlobal`, and `@/lib/supabase` is mocked so `api()` attaches `Bearer tok`.

| Test | Checks |
|------|--------|
| fetchConnections GETs the request list | URL `/api/admin/requests/R1/connections`, the Bearer header, and that a valid body comes back unchanged. |
| rejects a body without connections | The guard turns a malformed body into an `ApiError`. |
| refreshConnection POSTs the refresh route | URL `/api/admin/connections/C1/refresh` and `method: 'POST'`. |
| refreshConnection surfaces a 502 code | A 502 body becomes `ApiError { status: 502, code: 'provider_unavailable' }`. |
| fetchTransactions GETs with the months window | URL ends in `?months=3`. |
| guard rejects an unknown kind | `isConnectionSummary` accepts the fixture and rejects `kind: 'signature'`. |
| guard checks each employer pay stub row | A payroll summary with one employer passes when `recent_pay` holds a well-formed row (`gross_pay` a number, `net_pay` `null`) or is empty, and fails when `recent_pay` is missing, `gross_pay` is a string, `pay_date` is `null`, or `document_id` is a number. |

`CONNECTION` is a minimal valid bank summary; `EMPLOYER` a minimal valid employer with one `recent_pay` row; `withEmployer(e)` wraps one employer in a payroll copy of `CONNECTION`; `reply` queues one JSON `Response`; `lastCall` returns the last `[url, init]` pair.
