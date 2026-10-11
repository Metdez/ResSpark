# `app/worker/src/worksheet/store.ts`

Loads one determination run with the sources of its confirmed values, renders the worksheet once, and files the PDF as a case document (Plan 07-06, D-16, FORM-06). Each function creates its own service-role client and throws fixed error codes, so database messages never leave this module.

| Part | What it does |
|------|--------------|
| `WORKSHEET_TYPE` | `'worksheet_433a'`, the `documents.document_type` that migration 0008's `logics_push_create_batch` and `db/logics-pushes.ts` treat as pushable without a request item. |
| `worksheetPath(firm, case, run)` | `firm/{firm}/case/{case}/worksheets/{run}.pdf` in the private `case-documents` bucket. It is built from ids only. `documents.storage_key` is UNIQUE, so this path is the idempotency key (RESEARCH Pitfall 11: pdf-lib bytes change on every render, so a content hash cannot be the key). |
| `getRun(env, p)` | Reads the `determination_runs` row matching `id`, `case_id` **and** `firm_id`. A run of another case or firm reads as `null`, and the route answers 404. |
| `latestRequestId(env, firm, case)` | The case's newest request (`created_at DESC`) whose status is not `revoked`, or `null`. The push card of that request shows the worksheets. |
| `loadWorksheetInput(env, p)` | Reads the run first. It then reads, in parallel, the case (name, Logics CaseID, firm-scoped), the firm name, the `accepted`/`edited` proposals with `decided_at <= run.created_at` (newest first), and `standards_versions`. The first proposal per column gives that column's source, status and decider. Decider names come from `staffDisplayNames` (firm-scoped), which also names the run's creator. Open proposals are never read: the worksheet shows confirmed values only (D-16). `snapshot` is the run's `financial_data_snapshot`, so the PDF shows exactly the facts the run used. `run` is `toRunView` from `financials/evaluate.ts`. |
| `existingDocument` | The `documents` row for this storage key within the case, or `null`. |
| `pagesOf` | Reads the page count of an earlier export from its `worksheet.generated` event (`payload->>document_id`). |
| `already(...)` | Builds the re-export answer: the same document, `already: true`. A row still `uploading` means another export is in flight, so it throws `worksheet_in_progress` (route: 409). |
| `exportWorksheet(env, p)` | 1. The run must belong to the case and firm, otherwise `null`. 2. An existing row for the path is returned as `already`. 3. It loads the input and builds the file name `433A-screening-worksheet-<Logics CaseID or case id>-<run date>.pdf`. 4. It inserts the `documents` row as `uploading` **before** rendering, with `request_item_id` NULL, `document_type 'worksheet_433a'` and `uploaded_by_actor 'staff:<id>'`. A concurrent export hits 23505 here and gets the winner's row, or 409 while the winner is still uploading. 5. It renders, uploads with `contentType: 'application/pdf'` and `upsert: false`, hashes the bytes with `crypto.subtle.digest('SHA-256')`, and flips the row to `ready` with `size_bytes` and the hex `sha256`. 6. It logs `worksheet.generated { run_id, document_id, pages }`: ids and a count, no amounts. If any step after the insert fails, the `catch` removes the object and the still-`uploading` row, then rethrows, so the next export starts clean. |
| `listCaseWorksheets(env, firm, case)` | Checks that the case belongs to the firm (`null` otherwise). Returns `request_id` plus the case's `ready` worksheet documents with no request item, newest first: `{ id, file_name, size_bytes, sha256, created_at (uploaded_at), run_id (from the storage key) }`. |

Security: only the run snapshot's line columns are rendered (T-07-25). The bucket is private, and reads go through short-lived signed URLs (T-07-28).

Tests: `app/worker/test/worksheet.test.ts` (live).
