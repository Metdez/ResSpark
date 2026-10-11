# `app/src/features/financials/extract-button.tsx`

`ExtractButton({ caseId })`: the `Extract values` button in the 433-A header (FORM-03, D-17, Plan 12). It asks the Worker to read the case's uploaded PDFs into Document proposals. Staff then confirm those proposals like any other source. `financials-page.tsx` passes it to `FinancialsHeader` through the `actions` slot.

| Part | What it does |
|------|--------------|
| `REASON` | Plain copy for each reason code: `no_template` is `No matching template`, `missing_fields` is `Required values not found`, `unreadable` is `Could not read this PDF`, `too_large` is `Too large`, and `not_pdf` is `Not a PDF`. Raw codes are never shown (D-20). |
| `useMutation` | Calls `extractValues(caseId)` (`api.ts`). On success it shows the toast `Read {parsed} of {documents} documents. {inserted} new values proposed.` When the call settles, success or failure, it invalidates `['financials', caseId]` so the new proposals appear without waiting for the 5-second poll. Errors use the app's global mutation error handling. |
| Button | Outline, small. While the request runs it is disabled and reads `Reading documents…`. |
| `ul` `Documents not read` | After a run, lists each failed file and then each skipped file as `{name}: {plain reason}`. It is hidden when every file was read. It shows only names and reasons, never extracted text. |

## Tests

`extract-button.test.tsx` (`web` project; `extractValues` and `sonner` mocked):

1. The click calls `extractValues('C1')`, and the disabled `Reading documents…` button shows while the request is pending. On resolve, the toast reads `Read 2 of 3 documents. 4 new values proposed.`, the list shows `scan.pdf: No matching template` and `photo.png: Not a PDF`, no raw code appears, and `invalidateQueries({ queryKey: ['financials', 'C1'] })` was called.
2. The other three reasons map to their plain copy.
3. `isExtractResult` accepts the Worker shape and rejects an unknown reason or a missing `proposals` object.
