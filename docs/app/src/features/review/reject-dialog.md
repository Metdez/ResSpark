# `app/src/features/review/reject-dialog.tsx`

The dialog that asks for a note before an item is rejected (Plan 03-03; D-05, UPL-04, T-03-14).

It uses the shadcn `Dialog`, not `AlertDialog`, because the decision needs an input. Otherwise it follows the UI-SPEC destructive confirmation: the title is the verb plus the object, the confirm button uses the same verb with `variant="destructive"`, and `Cancel` gets the initial focus.

| Part | What it does |
|------|--------------|
| Props | `open`, `onOpenChange`, `onConfirm(note)`, `pending` (the mutation is in flight), and `error` (rendered under the field, supplied by the panel). |
| `note` state | Starts empty. The panel mounts a fresh dialog per item (`key={item.id}`), so a note never carries over to another item. |
| `onOpenAutoFocus` | Prevents Radix's default focus on the first control and focuses `Cancel` instead. |
| Title and description | `Reject this item?` / `The client will see your note and be asked to upload again.` |
| Preset buttons | One outline `sm` button per `REJECT_PRESETS` entry. A click replaces the note with that text, which the staff member can then edit. |
| `Textarea` | Labelled `Note to the client`, `maxLength={500}`. The browser stops typing at 500; a pasted or programmatic value can still exceed it, so the length is checked too. |
| Counter and error | From 450 characters a muted `n/500` counter appears. Over 500 the field is `aria-invalid` and shows `Keep the note under 500 characters.` |
| `Reject` | Disabled while pending, while the note is too long, or while the trimmed note is empty. A click calls `onConfirm` with the trimmed note. The Worker checks the same rules (400 `note_required` / `note_too_long`), and the RPC refuses an empty note as well. |
| `Cancel` | Closes the dialog through `onOpenChange(false)`. |
