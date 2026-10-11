# `app/worker/src/integrations/logics/lookup.ts`

Lookup orchestration for the "find the client" screen (LOOK-01, LOOK-02, LOOK-03). It takes what the staff member typed, normalizes it, calls the right `LogicsClient` operation (live or fake), and returns an ordered, de-duplicated list of case summaries.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports the shared phone helpers from `app/src/lib/contact.ts` (one rule for SPA and Worker), the client interface, and the mapper. |
| 5 | `LookupType`: `case_id`, `phone`, or `email`. |
| 7-11 | `LookupInput`: the type, the raw value, and an optional last name that narrows a phone search. |
| 13 | `CASE_ID`: 1-9 digits. |
| 14-15 | `EMAIL`: a cheap syntax gate. The full Zod email check is in `contact.ts`. |
| 17 | `digitsOf`: the digits of a string, or `''` for a non-string. |
| 19-27 | `detectLookupType`: empty → `null`; contains `@` → `email`; after removing `()+-. ` it must be all digits (anything with letters → `null`); 1-9 digits → `case_id`; a valid `normalizePhone` result → `phone`; otherwise `null` (for example 11 digits without a leading `1`). |
| 29-36 | `matchedFieldFor`: email search → `email`; last-name search → `last_name_phone`; otherwise the first of `CellPhone`/`HomePhone`/`WorkPhone` whose digits equal the searched digits → `cell`/`home`/`work`. |
| 38-54 | `dedupeAndOrder`: keeps the first summary per `CaseID` and drops rows without an integer id, then sorts newest `created_date` first. Unknown dates sort last and ties go by `CaseID` ascending, so the card order is stable. |
| 56-62 | `lookupCases`, case id: rejects `case_id_invalid` unless 1-9 digits, then `caseInfo` → one `case_id` summary or `[]`. |
| 64-69 | Email: trimmed and lowercased, `email_invalid` when the gate fails, then `findByEmail`. Non-ASCII addresses are passed through unchanged (no Unicode normalization). |
| 70-82 | Phone: `phone_invalid` unless `normalizePhone` accepts it. With a last name it calls `findByLastNameAndPhone`. Without one it calls `findByPhone` with digits only, and only when that returns an empty list it retries once with the doc's `(###)###-####` format. The retry result replaces the empty list; nothing is merged. The `shortcut:` comment marks this retry for removal once the accepted header format is confirmed (D-04). |
| 83 | Maps every row with `toSummary` and the matched field, then de-duplicates and orders. |
| 86-89 | `fetchCaseSummary`: one case by id → `case_id` summary or `null`. Plans 03-05 use it to re-read a case before creating a request. |

## Error tokens

`phone_invalid`, `email_invalid`, `case_id_invalid` are thrown as plain `Error` messages for the route to map to field copy. `LogicsError` from the client passes through untouched.

## Tests

`lookup.test.ts` (`worker-node` project): type detection for all phone shapes, email, case id, empty, words, and 11 digits without a leading 1; with the fake client: the shared-phone two-card result and its order, last-name narrowing, email case folding, case id hit and miss, and the three invalid tokens; with a stubbed live client: the retry runs only after an empty first call and in that order, no retry after a hit, duplicate collapse, and tie and null-date ordering; `fetchCaseSummary` hit and miss.
