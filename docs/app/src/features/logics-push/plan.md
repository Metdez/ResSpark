# `app/src/features/logics-push/plan.ts`

Pure helpers that tell staff, before they click, what pushing a file to Logics will do (Phase 5 D-05, PUSH-02). The Worker consumer makes the real decision and records it in the ledger; this file is an estimate.

| Part | What it does |
|------|--------------|
| `LOGICS_PART_LIMIT_BYTES` | `5_767_168` (5.5 MiB). Mirrors `LOGICS_MAX_PART_BYTES` in `app/worker/src/integrations/logics/write-types.ts`; `plan.test.ts` imports the Worker constant and asserts they are equal, so the two cannot drift. |
| `LOGICS_MAX_SOURCE_BYTES` | `41_943_040` (40 MiB). Anything larger is not split automatically. |
| `PushPlan` | `single`, `split` (with `estimatedParts`), `image_to_pdf`, or `manual` (with a staff-facing `reason`). |
| `PushableDoc` | One approved, ready document as the push card and sheet see it: `id`, `name`, `size_bytes`, and its `plan`. |
| `manual(reason)` | Small constructor for the `manual` case. |
| `pushPlan(doc)` | Checks in this order: no size (`null` or `0`) → `manual` `File not finished uploading`; HEIC/HEIF by mime (`image/heic`, `image/heif`) or by extension (`.heic`, `.heif`, case-insensitive, so the extension wins over a wrong `image/jpeg` mime) → `manual` `Ask the client to re-upload as JPG or PDF.`; over 40 MiB → `manual` `over 40 MB`; a mime that is not PDF, JPEG, or PNG → `manual` `Unsupported file type`; over the part limit → `split` with `ceil(size / limit)` parts (an image over the limit splits too, because one photo must fit in one part); otherwise `image_to_pdf` for JPEG/PNG and `single` for PDF. |
| `planLabel(p)` | The row text: `Sends as 1 file`, `Will split into about N parts`, `Converted to PDF`, or `Needs manual compression — {reason}`. |
| `sizeLabel(bytes)` | `—` for `null`, whole KB under 1 MiB (minimum 1 KB), otherwise MB with one decimal. Same rule as the private `formatSize` in `features/review/document-row.tsx`, which is not exported; document-row was left alone. |

## Tests

`plan.test.ts`: the limit equals the Worker constant; PDF at the limit is `single`, one byte over is `split` 2, 20,000,000 is `split` 4; JPEG 1 MB is `image_to_pdf`; PNG 6 MB is `split` 2; HEIC by mime and by `IMG_0001.HEIC` name; 41,943,041 is `manual` `over 40 MB`; `null` and `0` sizes are `File not finished uploading`; every `planLabel` string; `sizeLabel` for 2 KB, 7.0 MB, and `null`.
