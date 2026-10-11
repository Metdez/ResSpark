# `app/src/features/settings/integrations/push-settings-card.tsx`

`PushSettingsCard`: the `Push settings` card under the IRS Logics card on Settings → Integrations (Plan 05-05, D-08, PUSH-01, PUSH-03). An admin sets how approved documents are filed in Logics and turns firm-level pushes on. It is split out of `logics-settings-page.tsx` to keep that file small.

| Part | What it does |
|------|--------------|
| Props | `settings` (`LogicsSettings` from the GET), `activityTypes` (strings the last Test connection saw), `activityTypesError` (HTTP status from the last test's activity listing, if it failed), `isAdmin`. |
| `CATEGORY_ERROR` | `Enter a whole number of 1 or more, or leave it empty.` |
| `parseCategory(raw)` | Empty → `null` (FileCategoryID omitted, never 0, Pitfall 5); digits >= 1 → the number; anything else → `undefined` (invalid). Mirrors the Worker's T-05-18 rule. |
| `activityLine(types, error)` | Error → `Logics returned {n} for the activity listing — the key may lack case.read on activities; connection still OK`; a non-empty list → `Activity types seen in Logics: a, b`; else `Not checked — add a test CaseID to LOGICS_TEST_CASE_IDS`. |
| Form state | `category`, `activity`, `write`, initialised from `settings`. The page remounts the card when the saved settings change. |
| `save` mutation | `updateLogicsSettings(patch)`; on success `toast.success('Settings saved')` and invalidates `LOGICS_KEY`. Errors fall to the app's default mutation handler (generic staff toast). |
| `patch` | Only the keys that differ from `settings` and are valid. `canSave` needs a valid category, a 1..60 character activity type, at least one changed key, and no save in flight. |
| `options` | The listed types plus the saved `activity_type`, so the saved value stays selectable. |
| File category | `Label` `File category ID (optional)` over a numeric `Input` (`min=1`); the helper `Leave empty to let Logics use its default category.` turns into `CATEGORY_ERROR` with `aria-invalid` when invalid. |
| Activity type | A shadcn `Select` when Logics listed types, else a text `Input` (max 60); both are bound to `activity`. The `activityLine` sentence sits under it. |
| Write enabled | A `Switch` labelled `Write enabled` with helper `Pushes are refused for this firm until this is on.` (default off; the push route refuses with 403 `logics_write_blocked` while off, in fake and live mode). |
| Admin vs staff | Admin: right-aligned `Save` (`Saving…` while pending). Staff: every field disabled, no Save, and the muted line `Only a firm admin can change these settings.` The Worker's admin check is the real gate (T-05-26). |

## Notes

- `None listed` is not shown: the SPA cannot tell an empty listing from "no test CaseID configured", so an empty list always reads `Not checked`.

## Tests

`push-settings-card.test.tsx` (see `push-settings-card.test.md`), 8 cases: defaults with a free-text activity type and the `Not checked` line; a listed-types `Select` with both options and the `Activity types seen` line; saving all three fields sends `{ file_category_id: 7, activity_type: 'Document sent', write_enabled: true }` and toasts `Settings saved`; changing only the switch sends `{ write_enabled: true }`; `0` shows the inline error and never PUTs; clearing a saved `7` sends `{ file_category_id: null }`; staff see disabled fields and no Save; a passing test with `activity_types_error: 403` shows the 403 sentence.
