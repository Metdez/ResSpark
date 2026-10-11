# `app/src/features/uploads/upload-sheet.tsx`

`UploadSheet({ item, open, onClose, onError })`: the client's upload step (D-11, UPL-01, UPL-02, UPL-03). `StepList` opens it when the client taps `View` on an `upload` step. `item` is the step's `{ id, label, status }`; the agent's rejection note is not on the step (the `/api/c/state` DTO is allow-listed) and comes from the documents list instead. `onError` (optional) receives `uploadErrorCode(code)` every time a row fails, so the portal can report the latest upload error to staff (STAT-03).

## Layout (bottom sheet, one column, max 30 rem)

1. **Title:** the item label. **Description:** "Take a photo of each page or choose files from your phone."
2. **Rejected item:** a destructive `Alert` "Your agent asked for a new copy: {note}" (only when the server returned a note).
3. **Approved item:** an `Alert` "Your agent approved this." and no file controls.
4. **Otherwise two controls:**
   - A 56 px (`h-14`) primary button, "Take photo or choose files" ("Upload again" when the item is rejected). It clicks a hidden `<input type="file" accept="image/*,.pdf,.heic,.heif" capture="environment" multiple>`, which opens the camera on phones.
   - A 44 px outline button, "Choose from files", for a hidden input with the same `accept` and `multiple` but no `capture`. iOS opens only the camera when `capture` is set, so this second input is how a client reaches the photo library and PDFs (M8/M10).
5. **File list:** files already on the server first, in the order the server returned (`uploaded_at, id`), then files picked in this session, each as a `FileRow`.
6. **Footer:** "Done with this item" (44 px, full width), disabled until at least one row is `ready`, and "Close" (44 px, outline). Both call `onClose`. The vendored 16 px icon close is hidden, as in `ComingNextSheet`.

## Data

- `useQuery(['portal', 'item', id, 'documents'], listItemDocuments)` gives the item's current `status`, its `rejection_note`, and the existing documents (`ready` shows "Sent to your agent", `rejected` shows "Needs a new copy"). Until it loads, the prop's `status` decides the layout.
- New files live in local state (`rows`). They are not merged into the query, so a later refetch never duplicates them.
- No heartbeat is sent from here. Phase 2's `onView(step)` already reports `last_step: 'upload'`; no file name or free text reaches the heartbeat (T-03-11).

## Per-file pipeline (`send`)

Each picked file runs on its own; `onPick` starts them with `Promise.allSettled`, so one failure never cancels another. Picking zero files does nothing. The input's value is reset so the same file can be picked again.

1. `acceptFile`: a wrong type shows "We can take PDFs and photos (JPG, PNG, HEIC)." and an empty file "That file is empty. Try again."; no API call is made.
2. `preprocess` (row "Preparing…"): resize, HEIC conversion or pass-through. A processed blob over 25 MB (`MAX_BYTES = 26_214_400`, the bucket's cap) shows the too-big sentence; a 0-byte result shows the empty sentence.
3. `sha256Hex` of the processed blob.
4. **Mint or resume:** if `readPending(item.id)[pendingKey(file)]` holds a document id from an interrupted session, `remintToken` gets a fresh token for that object (a failure, such as 409 `document_not_uploading`, clears the entry and falls through). Otherwise `mintUpload` with the processed name, type and size, then `writePending`. This runs for both transports; on the PUT branch it reuses the document instead of leaving an orphan `uploading` row, and the bytes are simply sent again from zero.
5. `uploadBlob` (row "Uploading… N%"), with an `AbortController` per file. An `upload_failed` (4xx from Storage, for example an expired token or a tus offset mismatch) clears the pending entry so the next try mints a new document.
6. `completeUpload` with `{ sha256, size }` (row "Checking…"), then `clearPending`, and the row reads "Sent to your agent".

**Errors:** the code (`PortalError.code`, `UploadError.code`, or `heic_failed`; anything else counts as `network`) goes through `errorCopy`. Codes in `FINAL` (`unsupported_type`, `file_too_large`, `bad_file_type`, `empty`, `item_approved`, `heic_failed`) cannot succeed on retry, so the row offers `Remove`; for `bad_file_type`/`file_too_large` from `complete` the server already deleted the object and the pending entry is cleared. Every other code offers `Try again`, which runs the same file through the pipeline again. A 4xx from mint, such as `too_many_files`, is shown once; nothing retries a 4xx automatically.

**Close:** unmounting aborts every in-flight upload (XHR `abort()` or tus `upload.abort()`); aborted files update nothing. "Done with this item" never marks the item done; the Worker's `complete` already set it `submitted`, and `StepList` refetches `['portal', 'state']` so the chip reads "With your agent".

## Tests

`upload-sheet.test.tsx` mocks `./api`, `./transport` and `./preprocess` and renders with `renderWithQuery` (createRoot + act). It covers: title, intro, both inputs' attributes (`accept`, `capture`, `multiple`), control heights and the disabled Done; two files mint, upload and complete in parallel, show "Sent to your agent", enable Done, and Done calls `onClose`; zero files does nothing; a `.txt` is refused with no API call and offers Remove; `onError` gets `unsupported_type` for the `.txt` and `upload_failed` for an unknown server code from mint; `too_many_files` from mint shows the 10-file sentence; one file failing leaves the other ready and offers Try again; a rejected item shows "Your agent asked for a new copy: blurry", "Upload again" and "Needs a new copy"; an approved item shows the approval and no file input; listed files come first in server order, then the new file.
