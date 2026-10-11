# `app/worker/src/integrations/logics/client.ts`

The IRS Logics API client (D-02, Phase 5 D-07). It is the only code that talks to a Logics tenant: four lookups and, from Phase 5, the two writes (`Documents/CaseDocument`, `CaseActivity/Activity`) plus the `ActivityType` listing. Plans 03-05 import the `LogicsClient` interface, so swapping transport or adding the optional `details` header later changes this file only.

## Structure

| Part | What it does |
|------|--------------|
| Imports | `LOGICS_MAX_PART_BYTES`, the two zod guards and the `LogicsWriteClient` interface from `write-types.ts` (Phase 5). |
| Header comment | The rules: every lookup parameter is an HTTP header (never a query string); read errors carry only a kind and an HTTP status; the two writes never throw and return `sent`, `failed` or `unknown`. |
| `LogicsFindRow` | One row of a `Find/*` response, typed after the documented sample. Every field except `CaseID` is optional and nullable because Logics says the list "grows over time". The index signature (`[k: string]: unknown`) admits the extra fields (`SaleDate`, `TaxAmount`, `TeamID`, ...) without trusting them. |
| `LogicsCaseInfoRow` | The `Case/CaseInfo` `data` object. It has `Status` instead of `StatusID` and no `CreatedDate`; sensitive fields such as `DOB` arrive through the index signature and are dropped by the mapper. |
| `LogicsErrorKind` | The six error kinds read callers branch on. `not_configured` is thrown by `config.ts`, not by this file. |
| `LogicsError` | The message is the kind string, nothing else, so a log line or API response built from it cannot leak the URL, headers, credentials, search value, or response body (C8, PLAT-08). `status` holds the HTTP status when there was one. |
| `LogicsCreds` | Base URL plus the two Basic-auth halves. The base URL must end in `/` (see `validateLogicsBaseUrl` in `config.ts`) so relative paths resolve under `/publicapi/V4/`. |
| `LogicsClient` | The four read operations, and (Phase 5) `extends LogicsWriteClient`: `createCaseDocument`, `createActivity`, `listActivities`. `fixtures.ts` implements the same interface for `LOGICS_MODE=fake`. |
| `Envelope` | The parts of the Logics response wrapper (`{ Success, data, message, StatusCode, Timestamp }`) the reads use. |
| `createLogicsClient` | Builds `Authorization: Basic base64("<API Key>:<Secret Token>")` once, as the Logics auth guide specifies (the same value as `'Basic ' + btoa(key + ':' + secret)`). `fetchImpl` defaults to the global `fetch` and is injected in tests. |
| `send` | One GET to `new URL(path, baseUrl)` with the auth header, `accept: application/json`, the operation's headers, and a 3000 ms `AbortSignal.timeout` (T-02-10). |
| `call` | The read retry and error policy. A thrown fetch (network failure or timeout) is retried exactly once; a second throw becomes `LogicsError('network')`. HTTP responses are never retried: 401 becomes `unauthorized`, 403 `forbidden`, any other non-2xx `upstream` with its status. A body that is not JSON becomes `invalid_response`. |
| `find` | Returns `data` when it is an array and `Success` is not `false`, otherwise `[]`. |
| `writeStatus(status)` | The 05-RESEARCH Q1 status table shared by both writes: 401 is `failed` `logics_auth`; 403 is `failed` `logics_scope` (the key lacks `case.write` or `activity.write`); 5xx is `unknown` `logics_5xx` (the server received the body, C9); any other 4xx is `failed` `logics_rejected_<status>`; a 2xx returns `null` so the body is parsed. |
| `write(path, init)` | One POST with the auth header, `accept`, the caller's headers, the body and a 60 s `AbortSignal.timeout`. A throw from `fetch` (network, timeout `AbortError`, Worker eviction) is `unknown` `logics_no_response`, because the request may have been dispatched. Never retried, never logged. Returns either an early outcome or the parsed JSON body (`null` when the body is not JSON). |
| `createCaseDocument(p)` | `POST Documents/CaseDocument`, multipart. The size gate runs first: over `LOGICS_MAX_PART_BYTES` it returns `failed` status 0 `size_gate` without calling `fetch`. `FormData` fields `CaseID` (string), `Comment`, `FileCategoryID` only when configured, and `File` as `new File([bytes], fileName, { type: 'application/pdf' })` with the filename argument. No `content-type` header: the runtime writes the multipart boundary. A 2xx is `sent` only when `isCaseDocumentCreated` passes (integer `CaseDocumentID`); anything else is `unknown` `logics_unparsed_200`. |
| `createActivity(p)` | `POST CaseActivity/Activity` with `content-type: application/json` and `{ CaseID, ActivityType, Subject, Comment, Popup: false, Pin: false }` (the JSON body is research assumption A3; verify on the first manual live test). Same mapping; `sent` only with an integer `ActivityID`. |
| `listActivities(caseId)` | `GET CaseActivity/Activity` with header `CaseID` (the Phase 2 header-parameter pattern), through `send`. Non-2xx gives `{ kind: 'failed', status }`; a thrown fetch gives status 0. `data` may be one object (the vendor example) or an array; it collects the `ActivityType` strings, drops empty ones, dedupes and sorts. Used by the Plan 03 Settings work (D-08). |
| Find operations | The three Find calls and their exact header names. |
| `caseInfo` | Sends `CaseID` as the string form of the integer. A 404, `Success: false`, null data, or a `data` without `CaseID` all mean "no case" (`null`). The `shortcut:` comment records that Logics does not document the unknown-id response. |

## Header parameters

| Method | Endpoint | Headers |
|--------|----------|---------|
| `findByPhone(phone)` | `GET Find/FindCaseByPhone` | `phone` |
| `findByEmail(email)` | `GET Find/FindCaseByEmail` | `email` |
| `findByLastNameAndPhone(lastName, phone)` | `GET Find/FindCase` | `lastName`, `phone` |
| `caseInfo(caseId)` | `GET Case/CaseInfo` | `CaseID` |
| `listActivities(caseId)` | `GET CaseActivity/Activity` | `CaseID` |

All reads also send `authorization` and `accept`.

## Retry rule

| Outcome | Retried? | Result |
|---------|----------|--------|
| fetch throws (network error, 3 s timeout) | once | second throw → `network` |
| 401 | no | `unauthorized` (401) |
| 403 (missing `case.read` scope) | no | `forbidden` (403) |
| 404 on `caseInfo` | no | `null` |
| other non-2xx, including 500 | no | `upstream` (status) |
| 2xx with non-JSON body | no | `invalid_response` |

Logics reads are the only retried calls in the platform; writes are never retried (PUSH-04): any doubt after dispatch is `unknown`, and only staff can send again.

## Write outcomes

| Observation | Result |
|---|---|
| part over 5,767,168 bytes | `failed` 0 `size_gate`, no `fetch` |
| 2xx with integer `CaseDocumentID` / `ActivityID` | `sent` |
| 2xx without it, or not JSON | `unknown` `logics_unparsed_200` |
| 401 / 403 | `failed` `logics_auth` / `logics_scope` |
| other 4xx | `failed` `logics_rejected_<status>` |
| 5xx | `unknown` `logics_5xx` |
| fetch throws (network, 60 s timeout) | `unknown` `logics_no_response` |

## Tests

`client.test.ts` (co-located, `worker-node` project) uses a `vi.fn()` fetch stub. It covers the URL and headers of all four operations (and that there is no query string), the Basic auth value, `[]`/`null` on `Success: false` or null data, 404 → `null` on `caseInfo`, 401/403/500 called once, the retry-once-then-resolve and retry-once-then-`network` paths, `invalid_response`, that no error message contains the key, token, phone, or host, and that an `AbortSignal` is passed.

`client-write.test.ts` (co-located) covers the writes with a recording `vi.fn()` fetch: the size gate at 5,767,169 bytes (no fetch) and 5,767,168 (one fetch); URL, method, Basic header, no `content-type`, `FormData` fields and the `File` name and type, `FileCategoryID` absent or `'7'`; every row of the outcome table including a string `CaseDocumentID`, a non-JSON 200, a `TypeError` and an `AbortError`; the activity JSON body with `Popup`/`Pin` false and its outcome mapping; `listActivities` header, single-object and array `data` (deduped, sorted, empties dropped), and a 403. `write-types.test.ts` covers the guards and the gate constant.
