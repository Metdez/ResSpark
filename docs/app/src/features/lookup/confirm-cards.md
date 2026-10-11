# `app/src/features/lookup/confirm-cards.tsx`

`ConfirmCards({ results, searchType, onConfirmed })`: one card per Logics lookup result with the explicit "Yes, this is the client" tap (LOOK-02, D-05, PITFALLS C8, threat T-02-25).

| Part | What it does |
|------|--------------|
| `MATCHED` | Words for the matched field: `cell phone`, `home phone`, `work phone`, `email`, `case ID`, `last name and phone`. |
| `confirmErrorCopy(code)` | The Logics two-part copy, or `Case not found` / `Search again, or ask the client for another contact.` for a 404 `case_not_found` (the case disappeared from Logics between search and confirm). |
| `ConfirmCards` | One `useMutation(confirmCase)` for all cards. On success it calls `onConfirmed(case_id)`. `onError` is `unlessHandled(...)`: known codes show an `Alert` above the cards; anything else reaches the app handler. |
| In-flight rule | `confirming` is true only on the card whose id is the mutation's variable; `disabled` is true on every card while any confirm is pending, so two confirms cannot race. |
| `CaseCard` | `data-case-card` on the `Card`. Heading: full name (or `Unknown name`). Line 1: `Case {id}`, a neutral `Status {id}` badge (or `Status unknown`), `Created {Aug 14, 2026}` with the raw value in `title` (omitted when unknown), and `{city}, {state}` when present. Line 2 (muted): the masked primary phone (cell, then home, then work, normalized to E.164 then `maskPhone`, or `No phone on file`) and the email (or `No email on file`). Line 3: a neutral `Matched {field}` badge and the outline `Yes, this is the client` button (`Confirming…` with `Loader2` while its confirm runs). |

## Notes

- Nothing is preselected or auto-confirmed, even for a single result: the tap is the chosen step (C8).
- Only `search_type` goes to the Worker; it re-reads the case from Logics by id before storing it.
- Names and emails from Logics are rendered as React text nodes (escaped); there is no raw HTML (T-02-26).
- Covered by `lookup-page.test.tsx`.
