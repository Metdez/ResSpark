# `app/src/features/lookup/lookup-page.tsx`

`LookupPage({ onConfirmed })`: the "Find a client" screen (LOOK-01, LOOK-03, LOOK-05, D-05, D-15). Staff type one value; the page detects whether it is a case ID, phone, or email, searches Logics through the Worker, and shows confirm cards. The component has no router dependency; the route passes `onConfirmed`.

| Part | What it does |
|------|--------------|
| `HELPER` | The live helper line per detected type: `Searching by phone number`, `Searching by email`, `Searching by case ID`. |
| `NOUN` | The type's name for the empty-state body. |
| `INLINE` | Field errors from the Worker shown under the input: `phone_invalid`, `email_invalid`, `case_id_invalid`. |
| State | `value` (the one input), `lastName` (phone searches only). `type` is `detectLookupType(value)` on every render. |
| `search` mutation | `lookup(...)`. `onError` is `unlessHandled(...)`: inline codes and Logics codes render here; anything else reaches the app handler (401 sign-out, 403, generic toast). |
| `edit(set, v)` | Updates a field and resets the mutation, so results and errors for an old value disappear (a stale card can never be confirmed with the wrong search type). |
| `submit` | Ignored while undetectable or in flight. Posts `{ type, value }` (trimmed), plus `last_name` only for a phone search with a non-blank last name. Enter submits. |
| Title | `Find a client` (Display). |
| Value field | `Label` `Case ID, phone, or email`, `inputMode="search"`, `autoComplete="off"`. The helper reads the detected type, or `Enter a case ID, a phone number, or an email.` when undetectable; an inline error replaces it in destructive text with `aria-invalid` on the input. |
| Last name field | `Last name (optional)`, rendered only when the detected type is `phone`. |
| `Search` | Primary, right-aligned from 640 px; disabled while undetectable; `Searching…` with a 16 px `Loader2` while in flight. |
| Logics alert | Destructive two-part `Alert` from `logicsErrorCopy`. |
| Fixture notice | When the response says `mode: 'fake'`: `Using built-in test cases` / `Lookups use ResSpark's sample cases until the Logics mode is switched to live.` with Lucide `FlaskConical`, `role="status"` (informational, not an error). C1: fixture results never pass for real clients. |
| Results | `ConfirmCards` with the results in the Worker's order and the type that was searched. |
| Empty block | No results: a `min-h-60` card with a 48 px `SearchX`, `No matching case`, and `Check the {phone number / email / case ID} and search again, or ask the client for another contact.` No card, no confirm. |

## Tests

`lookup-page.test.tsx` (`web` project, `test-utils/query-render.tsx` harness):

- title, labelled input, neutral helper, disabled `Search`;
- `(555) 010-0001` → `Searching by phone number`, last-name field, `Search` enabled;
- an email → `Searching by email`, last-name field gone;
- `900001` → `Searching by case ID`;
- `Jordan` → neutral helper, `Search` disabled;
- the posted body is `{ type: 'phone', value }`, with `last_name` only once filled;
- two fake-mode results → two cards in order with name, `Case 900001`, `Status 191`, `Created Aug 14, 2026`, `Austin, TX`, `(•••) •••-0001`, the email, `Matched cell phone` / `Matched home phone`, the confirm button, and the fixture notice;
- live mode → no notice;
- no results → the empty block naming `phone number`;
- confirming posts `{ search_type: 'phone' }` to `/api/admin/cases/900001/confirm`, shows `Confirming…`, and disables the other card's button;
- a 200 confirm hands the returned `case_id` to `onConfirmed`;
- 409 `logics_not_configured` and 502 `logics_unreachable` show their alerts;
- 400 `phone_invalid` shows `Enter a 10-digit US phone number.` inline with `aria-invalid` and no alert.
