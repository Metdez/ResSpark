# `app/worker/src/integrations/truv/reports.ts`

Truv income report, link documents, file download, and the rules that turn them into case files (D-06, PAY-02).

## Reads

- `getIncomeReport(env, linkId)`: `GET /v1/links/{link_id}/income/report/` through `truvFetch` (auth headers). The body must be an object with an `employments` array, else `ProviderError` `bad_response` (non-transient).
- `getLinkDocuments(env, linkId)`: `GET /v1/links/{link_id}/documents/`, the files the client uploaded inside Bridge. A 404 is `[]`. Accepts a bare array or `{ results: [] }`; rows without a string `id` and `file` are dropped. Returns `{ id, type, file, filename, mimetype }`.

## `collectEmployerFiles(report, docs)`

Builds the file list in this order, deduplicated by URL (the first occurrence wins):

| Source | Kind | Name (storage key) | Display name (`original_filename`) |
|--------|------|------|------|
| `report.pdf_report` | `income_report` | `income-report.pdf` | `Income report.pdf` |
| `employments[].statements[].file` | `pay_stub` | `paystub-<pay_date>[-<check_number>].pdf` | `Pay stub - <Month D, YYYY>[ - check <n>].pdf` (`Pay stub - undated.pdf` without a date) |
| `employments[].w2s[].file` | `w2` | `w2-<year>.pdf` | `W-2 - <year>.pdf` |
| `docs[]` type `PAYSTUB` / `W2` / `F1099` / other | `pay_stub` / `w2` / `form_1099` / `other` | `safeName(filename)`, else `<kind>-upload-<id>.pdf` | the client's `filename` as given, else the storage name |

Pay stub names start with the pay date, so within an employer folder a name sort is a date sort. Statement and W-2 entries carry Truv's `md5sum`; report PDFs and uploaded documents have none. The MIME type is `application/pdf` except for uploaded documents, which use their `mimetype`.

`displayName` (Oct 12 call: "an actual person has to read this inside Logics") is what `storeProviderFile` writes to `documents.original_filename`, the name staff see in Review and that the Logics push sends. It comes from the helpers in `storage/display-names.ts`; `name` is unchanged and stays the storage key, so `financials/evidence.ts` still matches stubs by key suffix. Files stored before this change were renamed by migration 0012.

## `truvDownload(url)`

A bare `fetch(url)`: the URL is pre-signed, so no auth headers are sent. Network failure gives a transient `ProviderError` `file_download_failed`; non-2xx gives `file_download_failed`, transient for 429 and 5xx only. The URL is never logged or stored.

## `stripFileUrls(report)`

Deep copy without any `file`, `pdf_report` or `access_token` key and without any string value starting with `http://` or `https://` under an object key. Figures (`gross_pay`, `pay_date`, `company.name`, ...) stay. This is what lands in `connections.data.employers[i].report`: vendor URLs expire, and the report's access token must not sit in the database.

## `md5Hex(bytes)`

Hex MD5 through `node:crypto` (`nodejs_compat` is on; Web Crypto has no MD5). Used only to compare with Truv's `md5sum`.

## Tests

`reports.test.ts`: report read with auth headers, `bad_response` for a body without employments, documents 404 gives `[]`, the file order and names from the Acme fixtures (with the duplicate URL collapsed), the five display names, md5 present only on statements and W-2s, URL and access-token stripping, `md5Hex('abc')`, download without auth headers, 500 transient and 403 not.

## Shared stub readers

`stubCheck(s)` (a string `check_number`, or a numeric one stringified, else `null`) and `stubPayDate(s)` (the raw `pay_date` string or `null`) are exported and used both here to name the stored file and in `db/connections-ops.ts` `recentPay` to find that file again, so the two readings cannot drift (review 2026-10-19).
