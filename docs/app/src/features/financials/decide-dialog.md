# `app/src/features/financials/decide-dialog.tsx`

`DecideDialog({ mode, line, pending, onClose, onSave })`: the one Dialog behind `Edit` and `Not applicable` on a 433-A line (D-06, FORM-04). A Dialog, not an AlertDialog, because the decision needs input.

| Part | What it does |
|------|--------------|
| `MAX_NOTE` | 2000 characters, the decide route's own limit. |
| `HINTS` | Helper text under the value field per kind: dollars with up to 2 decimals, a whole number, or one amount per vehicle separated by commas. |
| State | `raw` (the typed value) and `note`. The row mounts the dialog only while it is open, so each opening starts empty. |
| Validation | `parseInputValue(line.kind, raw)` for the value; the note must be non-blank and at most 2000 characters. `Save` stays disabled until both are valid in Edit mode (note only in Not applicable mode) and while a decision is in flight. A non-empty invalid value shows the parser's message in destructive text under the field and sets `aria-invalid`. |
| Title and body | Edit: `Edit {label}` / `Your value becomes the confirmed fact. The note is kept with the change.` Not applicable: `Mark {label} not applicable` / `The line is recorded as not applicable, with your note.` |
| Value field (Edit only) | Bool lines get a `Yes` / `No` two-button group (`aria-pressed`, group labelled `Value`); every other kind gets an `Input` labelled `Value` (decimal keyboard except for text). |
| Note field | `Textarea` labelled `Note (required)` (UI-SPEC: labels above inputs; this one is marked because it is the exception the user must not skip). |
| Footer | `Cancel` (outline) and `Save`, with a 16 px gap (UI-SPEC spacing for a decision next to the primary action). Save calls `onSave({ value, note })` in Edit mode and `onSave({ note })` for Not applicable: the decide RPC writes the not-applicable value (`0`, `false`, `"not_applicable"` or `[]`) itself, so the SPA never picks it. Closing the dialog any other way calls `onClose`. |

Tested through `line-row.test.tsx` (see `line-row.md`).
