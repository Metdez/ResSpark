# `app/worker/src/integrations/logics/mapper.ts`

Turns a raw Logics row (from a `Find/*` list or `Case/CaseInfo`) into the `LogicsCaseSummary` the lookup screen renders as a case card. The parsing is defensive because Logics says its response fields grow over time (PITFALLS M6).

| Lines | What it does |
|-------|--------------|
| 1 | Imports the two raw row types from `client.ts`. |
| 3 | `MatchedField`: why the row matched. `cell`/`home`/`work` name the phone field, `email` an email search, `case_id` a CaseInfo lookup, `last_name_phone` a last-name-plus-phone search. |
| 5-20 | `LogicsCaseSummary`: the only Logics fields the platform keeps. Snake case, every field except the id nullable. |
| 22-23 | `str`: a trimmed non-empty string or `null`. Empty strings, `null`, missing fields, and non-strings all become `null` ("unknown"), never a default. |
| 25-26 | `int`: an integer or `null`. Accepts `344624` and `'344624'`; rejects `''`, `null`, `undefined`, `'x'`, and fractions. |
| 28-46 | `toSummary`: builds the summary field by field from an explicit list and never spreads the raw row, which keeps `DOB`, `MaritalStatus`, `TaxLiability`, and `TaxAmount` out (C8, M6). `status_id` reads `StatusID` (Find) or `Status` (CaseInfo). `created_date` is `null` for CaseInfo rows, which have no `CreatedDate`. |

## Notes

- `logics_case_id` is cast to `number`. If Logics ever sends a row without a usable `CaseID` it becomes `null` at runtime, and `lookup.ts` drops that row.

## Tests

`mapper.test.ts` (`worker-node` project) maps the documented Find sample (where an empty `Language` becomes `null`), the documented CaseInfo sample (`Status` → `status_id`, no created date, no DOB or money keys, and no DOB value anywhere in the JSON), a string `CaseID`, a missing `FirstName`, and a non-integer status.
