# `app/worker/src/financials/extract-proposals.ts`

Turns a case's uploaded PDFs into `document`-source 433-A proposals (FORM-03, D-17). It runs the regex extractors ported in Plan 07-11 (`app/worker/src/extract/`). No LLM or outside service is called; the only I/O is Supabase (database rows, Storage downloads, two RPCs). Staff confirm these proposals like any other source. Nothing here writes `case_financial_data` (D-06).

## Exports

| Name | What it is |
|------|------------|
| `MAX_DOCUMENTS` | 25. At most this many documents are read per run, newest first (T-07-48). |
| `MAX_DOCUMENT_BYTES` | 10 MiB. Larger files are skipped as `too_large` (T-07-48). |
| `FailReason` / `SkipReason` | The fixed reason codes: `no_template`, `missing_fields`, `unreadable`; `too_large`, `not_pdf`. |
| `ExtractResult` | The route's response: `documents` (rows considered), `parsed`, `failed[]` and `skipped[]` (each `{ document_id, name, reason }`), and the upsert counts `proposals: { inserted, kept, superseded }`. |
| `failReason(error)` | Maps an extractor error to a reason code. Only `ExtractError` messages are inspected: `No template matched…` is `no_template`; `Missing…`, `No amount…` and `No dollar amount…` are `missing_fields`; any other error (another `ExtractError`, a plain `Error` such as Python's `KeyError` port, a bad PDF) is `unreadable`. The message itself is never returned, because it can quote document text (D-20). |
| `mergedRowToProposals(merged, refs)` | Converts the merged row into `ProposalInput[]`. See below. |
| `extractCaseDocuments(env, { firmId, caseId, actorId })` | The whole run. Returns `null` when the case is not in the firm. |

## `mergedRowToProposals`

- Keeps only keys that are `LINES` columns (`lineFor`). Private keys such as `_kind`, `_employer`, `ai_flags` and anything unknown are dropped.
- Always drops `state_of_residence` and `county_of_residence`. The county comes only from a confirmed address (D-12), so documents never propose either.
- Converts each value by the line's kind. `money`: a finite number rounded to cents with `Math.round(v * 100) / 100`. `money_list`: an array of finite numbers, each rounded to cents. `count`: an integer, kept as is. `bool`: a boolean. `text`: a string. A value of the wrong type is skipped, because the RPC's `financial_value_check` would otherwise reject the whole batch.
- Every proposal gets method `regex_extract`, reliability `B`, no window, and the same `source_refs`: one `{ kind: 'document', id, label }` per parsed file. The merged row mixes files, so each value cites all of them. The evidence sheet (Plan 07-10) turns these refs into signed download links.

## `extractCaseDocuments`

1. Reads the case by `firm_id` and `id`. If it is missing, the result is `null` and the route answers 404 (T-07-49).
2. Selects that case's documents with `status = 'ready'` and `document_type` either NULL or not `worksheet_433a` (the generated worksheet is never re-read). The `or(...is.null...)` clause is needed because SQL `<>` drops NULL rows. Order is `uploaded_at` descending, limit 25.
3. For each row, one at a time so only one PDF is in memory:
   - `mime_type` other than `application/pdf` is skipped as `not_pdf`.
   - `size_bytes` over 10 MiB is skipped as `too_large` before any download.
   - The object is downloaded with the admin Storage client. A download error is `unreadable`. If the downloaded blob is over 10 MiB (old rows may lack `size_bytes`), it is skipped as `too_large`.
   - `parsePdf(bytes, document_type)` runs. Success adds the part and a ref; an error adds a `failed` entry through `failReason`.
4. Merges the parts with `mergeDocuments` (the `parse_packet` merge) and converts them with `mergedRowToProposals`. When nothing parsed, the list is empty.
5. Calls `upsertProposals` with source `document`, generator version `extract-1`, `scopeColumns: null` and the staff actor. An empty list still runs, so document proposals from files that no longer parse, or were removed, are superseded (D-07). Unchanged values come back as `kept`.
6. Logs `financials.extracted` with counts only: `documents`, `parsed`, `failed`, `skipped`. No names, values or text.

## Not covered

- A merge error (for example a bank statement the port treats as Python's `KeyError`) throws and the route answers a generic 500. Such statements already fail inside `parsePdf`, so this path is not expected.
- Image uploads are not read. There is no OCR.
