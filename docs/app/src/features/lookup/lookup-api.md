# `app/src/features/lookup/lookup-api.ts`

The SPA side of the lookup and confirm routes from Plan 02-03: types, the lookup-type rule, guards, the two callers, and the Logics error copy shared with the request page. Every call goes through `api()`.

| Part | What it does |
|------|--------------|
| `LookupType`, `MatchedField` | `case_id` / `phone` / `email`, and which Logics field matched (`cell`, `home`, `work`, `email`, `case_id`, `last_name_phone`). |
| `LogicsCaseSummary` | One lookup result, the same fields as the Worker's `mapper.ts` (unknown values are `null`). |
| `LookupResponse` | `{ results, mode }`; `mode` is `fake` when the Worker answers from built-in test cases (`LOGICS_MODE=fake`). |
| `ConfirmResponse` | `{ case_id, logics_case_id, first_name, last_name, email, phone_e164 }` from the confirm route; `case_id` is our `cases` row id. |
| `CASE_ID`, `detectLookupType(raw)` | A copy of the Worker rule: trimmed empty → `null`; contains `@` → `email`; strip `()+-. `, then non-digits → `null`; 1-9 digits → `case_id`; a valid US phone (10 digits, or 11 starting with 1) → `phone`; else `null`. The Worker still validates. |
| `strOrNull`, `numOrNull`, `TEXT_FIELDS`, `isSummary` | Guard for one summary: numeric `logics_case_id`, nullable numeric `status_id`, the text fields string-or-null. |
| `isLookupResponse` | `mode` is `fake` or `live` and every result passes `isSummary`. |
| `isConfirmResponse` | String `case_id`, numeric `logics_case_id`, the rest string-or-null. |
| `json(body)` | `POST` init with a JSON body. |
| `lookup(input)` | `POST /api/admin/lookup` with `{ type, value, last_name? }`. |
| `confirmCase(id, searchType)` | `POST /api/admin/cases/{id}/confirm` with `{ search_type }`. Only the search type is sent; the Worker re-reads the case from Logics by id (C8). |
| `LOGICS_COPY`, `logicsErrorCopy(code)` | Two-part copy for `logics_not_configured`, `logics_unreachable`, `logics_unauthorized` (LOOK-05, UI-SPEC error convention). A `Map`, so codes like `toString` never match a prototype key. `requests-api.ts` re-exports it for the send screen: one source. |

## Tests

`lookup-api.test.ts` (`web` project): the Worker's own `detectLookupType` cases (email, case ID, four phone shapes plus a spaced one, `21211212121`, empty, blank, a word), `isLookupResponse` accepting fake and live and rejecting an unknown mode or a string case id, `isConfirmResponse`, and `logicsErrorCopy` returning the three titles and nothing for other codes.

The plan listed `'12345678901'` as a `null` case; it is 11 digits starting with 1, which the Worker classifies as a phone. The test uses the Worker's own example, `'21211212121'`.
