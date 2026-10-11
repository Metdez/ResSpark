# `app/src/features/client-portal/address/address-sheet.tsx`

`AddressSheet({ step, open, onClose })`: the client's address step (D-05, D-06, ADDR-01). Built only from the in-repo `Sheet`, `Input`, `Button`, and `Card`; no combobox library.

## Layout

`SheetContent side="bottom"` with `h-dvh` (full dynamic-viewport height) and the search input at the top, so the phone keyboard never covers it. The vendored 16 px icon close is hidden; a 44 px `Close` button sits at the bottom of every state. Every text is 16 px or larger (`text-base`, `text-xl`); every tap target is at least 44 px (`size="xl"` buttons, `h-11` inputs, `min-h-11` rows).

## State machine

`mode` is the stored state; `view` is what renders. `view` is `manual` whenever a suggest error (other than 429) exists while `mode` is `search` or `units`; otherwise it equals `mode`. Deriving this instead of setting state in an effect keeps the hooks lint rule happy and needs no reset logic.

| Mode | Shows | Leaves to |
|---|---|---|
| `search` | `Home address` input (autofocused, `autoComplete="street-address"`), up to 5 suggestion rows, `I can't find my address` | `units` (row with `entries > 1`), `confirm` (other row), `manual` |
| `units` | the same input, `Choose your unit`, the unit rows from a second suggest call with `selected=selectedFor(parent)` | `confirm` (a unit), `search` (typing) |
| `confirm` | card `Is this your home address?`, the two-line address, `Yes, that's my address`, `No, search again` | `unit` or `done` (saved), `manual` (422), `search` (No) |
| `unit` | `Add your apartment or unit number.`, `Apartment or unit` input, `Save`, `I don't have one` | `done` |
| `manual` | `ManualAddressForm` with the notice | `done` |
| `done` | `Address saved. Your agent has it.` | none |

`unitPrompted` makes the unit prompt appear at most once per sheet open: a second `needs_unit: true` answer goes straight to `done`. `Save` in the unit prompt re-posts the picked address with `secondary` set to the typed unit.

## Saving

`confirm` is a `useMutation` that posts `{ source: 'smarty', street_line, secondary?, city, state, zipcode }` (an empty `secondary` is omitted). Every success, smarty or manual, goes through `saved`, which invalidates `['portal','state']` so the step's chip moves to the submitted state, then moves to `unit` or `done`.

## Fallback triggers (D-06)

| Trigger | Result |
|---|---|
| `I can't find my address` | `manual`, no notice |
| suggest 503 `provider_not_configured` (no Smarty keys) | `manual`, `Enter your address below.` |
| suggest 429 `rate_limited` | ignored; the last list stays |
| any other suggest error (502 `provider_error`, network) | `manual`, the `lookupFailed` notice (the one-failure threshold of Plan 06-01) |
| confirm 422 `address_unverifiable` | `manual`, the `unverifiable` notice |
| any other confirm error | `toast.error(saveFailed)`, stays on the card |

No state shows a county question or county text.

## Tests (`address-sheet.test.tsx`)

Focus and a 16 px input in an `h-dvh` sheet; no request under 3 characters; the 249/250 ms debounce (fake timers); the 5-row cap with `min-h-11`; the confirm card text; the POST body, done copy, and the `['portal','state']` invalidation (a `QueryClient.prototype.invalidateQueries` spy); `No, search again` keeps the text; a failed save toasts; units via `selected`; picking a unit; the one-time unit prompt with a `secondary` re-post; `I don't have one`; each manual trigger; a 429 keeps the list. Every state asserts no `/county/i` text.
