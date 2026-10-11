# `app/src/features/uploads/file-row.tsx`

One row in the upload sheet's file list: the file name and size, its progress while it is being sent, and its outcome.

## Exports

| Symbol | What it is |
|--------|------------|
| `RowPhase` | `preparing` (resizing or converting), `uploading`, `checking` (the Worker checks the bytes), `ready`, `rejected` (the agent asked for a new copy), `error`. |
| `FileRowData` | `{ key, name, size (bytes or null), phase, progress (0 to 1), error?, canRetry? }`. `error` is already a client sentence from `errorCopy`. |
| `FileRow({ row, onRetry, onRemove })` | Renders one `<li data-file-row>`. |

## Rendering

- **Name and size:** `shortName` keeps names up to 32 characters; longer names keep the first 18 and the last 12 characters around an ellipsis, so the extension and camera numbering stay visible. The full name is in `title` (and the tests read it from there). `formatSize` shows KB (at least 1) under 1 MB, otherwise MB with one decimal; nothing when the size is unknown (`null` from the server).
- **Busy phases** (`preparing`, `uploading`, `checking`): the phase text from `uploadCopy` (`Uploading… 42%` while uploading) in an `aria-live='polite'` paragraph, and an 8 px progress bar (`role='progressbar'`, `aria-valuenow` = percent). The repo has no vendored shadcn `Progress`, so this is a plain two-`div` bar.
- **`ready`:** Phase 2's `StatusBadge` (`tone='success'`, `size='lg'`, 16 px) reading `Sent to your agent`.
- **`rejected`:** `StatusBadge` `tone='destructive'` reading `Needs a new copy`.
- **`error`:** the sentence in destructive text (`role='alert'`), and one 44 px button: `Try again` when `canRetry` (calls `onRetry`), otherwise `Remove` (calls `onRemove`). There is no remove action on `ready` rows; the server owns them.

All text is 16 px and both buttons are `size='xl'` (44 px), per UI-SPEC S5. Row layout wraps at 320 px.

Tested through `upload-sheet.test.tsx`.
