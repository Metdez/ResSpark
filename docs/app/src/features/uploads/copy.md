# `app/src/features/uploads/copy.ts`

Every sentence the client sees in the upload step, in one place. The voice follows the UI-SPEC Copywriting Contract: the person is "your agent", there are no exclamation marks, and an error says what happened and what to do next.

## `uploadCopy`

| Key | Text | Where |
|-----|------|-------|
| `control` | Take photo or choose files | The main button (opens the camera on phones). |
| `controlAgain` | Upload again | The main button when the agent rejected the item. |
| `chooseFiles` | Choose from files | The second button (photo library and PDFs on iOS). |
| `done` | Done with this item | The bottom button. |
| `intro` | Take a photo of each page or choose files from your phone. | Under the title. |
| `preparing` | Preparing… | A row while it is resized or converted. |
| `uploading` | Uploading… | A row while bytes are sent (with a percent). |
| `checking` | Checking… | A row while the Worker checks the file. |
| `ready` | Sent to your agent | A row that landed. |
| `needsNewCopy` | Needs a new copy | A row the agent rejected. |
| `approved` | Your agent approved this. | The alert on an approved item. |
| `rejectedPrefix` | Your agent asked for a new copy: | Prefix of the alert on a rejected item; the note follows. |
| `retry` | Try again | Row button after a retryable error. |
| `remove` | Remove | Row button after a final error. |
| `close` | Close | Footer button that closes the sheet without finishing. |

## `UploadErrorCode`, `uploadErrorCode(code)`

`ERRORS` is a plain object checked with `satisfies Record<string, string>`, so its keys are a literal type. `UploadErrorCode` is those keys plus `upload_failed`: the fixed set the upload sheet reports to staff through the heartbeat's `last_error` (STAT-03). `uploadErrorCode(code)` returns the code when it is one of the keys and `upload_failed` otherwise, so a server code with no client sentence never reaches the database as free text. `known(code)` is the shared own-property type guard used here and by `errorCopy`.

## `errorCopy(code)`

Maps a Worker or client error code to one sentence. Clients never see a code (UI-SPEC Error convention).

| Code | Sentence |
|------|----------|
| `unsupported_type` | We can take PDFs and photos (JPG, PNG, HEIC). |
| `file_too_large` | That file is too big (over 25 MB). Try a smaller scan or photo. |
| `empty` | That file is empty. Try again. |
| `too_many_files` | You can add up to 10 files for this item. |
| `bad_file_type` | That file is not a PDF or photo. Try again. |
| `upload_incomplete` | We didn't get the whole file. Try again. |
| `item_approved` | Your agent already approved this item. |
| `heic_failed` | We couldn't read that photo. Try a JPG or PDF. |
| `network` | Your connection dropped. Check your signal and try again. |
| anything else | Something went wrong. Try again. |

The lookup uses `Object.prototype.hasOwnProperty.call`, so a code such as `toString` falls back to the generic line instead of returning a function.

Tested in `api.test.ts` (see `api.md`).
