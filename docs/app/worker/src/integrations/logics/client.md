# `app/worker/src/integrations/logics/client.ts`

The read-only IRS Logics API client (D-02). It is the only code that talks to Logics for lookups. Plans 03-05 import the `LogicsClient` interface, so swapping transport or adding the optional `details` header later changes this file only.

| Lines | What it does |
|-------|--------------|
| 1-2 | The two rules: every lookup parameter is an HTTP header (never a query string), and errors carry only a kind and an HTTP status. |
| 4-19 | `LogicsFindRow`: one row of a `Find/*` response, typed after the documented sample. Every field except `CaseID` is optional and nullable because Logics says the list "grows over time". The index signature (`[k: string]: unknown`) admits the extra fields (`SaleDate`, `TaxAmount`, `TeamID`, ...) without trusting them. |
| 21-35 | `LogicsCaseInfoRow`: the `Case/CaseInfo` `data` object. It has `Status` instead of `StatusID` and no `CreatedDate`; sensitive fields such as `DOB` arrive through the index signature and are dropped by the mapper. |
| 37-43 | `LogicsErrorKind`: the six error kinds callers branch on. `not_configured` is thrown by `config.ts`, not by this file. |
| 45-53 | `LogicsError`: the message is the kind string, nothing else, so a log line or API response built from it cannot leak the URL, headers, credentials, search value, or response body (C8, PLAT-08). `status` holds the HTTP status when there was one. |
| 55-59 | `LogicsCreds`: base URL plus the two Basic-auth halves. The base URL must end in `/` (see `validateLogicsBaseUrl` in `config.ts`) so relative paths resolve under `/publicapi/V4/`. |
| 61-66 | `LogicsClient`: the four read operations. `fixtures.ts` implements the same interface for `LOGICS_MODE=fake`. |
| 68-71 | `Envelope`: the parts of the Logics response wrapper (`{ Success, data, message, StatusCode, Timestamp }`) the client reads. |
| 73-74 | `createLogicsClient`: builds `Authorization: Basic base64("<API Key>:<Secret Token>")` once, as the Logics auth guide specifies. `fetchImpl` defaults to the global `fetch` and is injected in tests. |
| 76-81 | `send`: one GET to `new URL(path, baseUrl)` with the auth header, `accept: application/json`, the operation's headers, and a 3000 ms `AbortSignal.timeout` (T-02-10). |
| 83-103 | `call`: the retry and error policy. A thrown fetch (network failure or timeout) is retried exactly once; a second throw becomes `LogicsError('network')`. HTTP responses are never retried: 401 becomes `unauthorized`, 403 `forbidden`, any other non-2xx `upstream` with its status. A body that is not JSON becomes `invalid_response`. |
| 105-108 | `find`: returns `data` when it is an array and `Success` is not `false`, otherwise `[]`. |
| 110-113 | The three Find operations and their exact header names. |
| 114-123 | `caseInfo`: sends `CaseID` as the string form of the integer. A 404, `Success: false`, null data, or a `data` without `CaseID` all mean "no case" (`null`). The `shortcut:` comment records that Logics does not document the unknown-id response. |

## Header parameters

| Method | Endpoint | Headers |
|--------|----------|---------|
| `findByPhone(phone)` | `GET Find/FindCaseByPhone` | `phone` |
| `findByEmail(email)` | `GET Find/FindCaseByEmail` | `email` |
| `findByLastNameAndPhone(lastName, phone)` | `GET Find/FindCase` | `lastName`, `phone` |
| `caseInfo(caseId)` | `GET Case/CaseInfo` | `CaseID` |

All four also send `authorization` and `accept`.

## Retry rule

| Outcome | Retried? | Result |
|---------|----------|--------|
| fetch throws (network error, 3 s timeout) | once | second throw → `network` |
| 401 | no | `unauthorized` (401) |
| 403 (missing `case.read` scope) | no | `forbidden` (403) |
| 404 on `caseInfo` | no | `null` |
| other non-2xx, including 500 | no | `upstream` (status) |
| 2xx with non-JSON body | no | `invalid_response` |

Logics reads are the only retried calls in the platform; writes are never retried.

## Tests

`client.test.ts` (co-located, `worker-node` project) uses a `vi.fn()` fetch stub. It covers the URL and headers of all four operations (and that there is no query string), the Basic auth value, `[]`/`null` on `Success: false` or null data, 404 → `null` on `caseInfo`, 401/403/500 called once, the retry-once-then-resolve and retry-once-then-`network` paths, `invalid_response`, that no error message contains the key, token, phone, or host, and that an `AbortSignal` is passed.
