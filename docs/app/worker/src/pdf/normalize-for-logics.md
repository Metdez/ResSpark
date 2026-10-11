# `app/worker/src/pdf/normalize-for-logics.ts`

Turns one stored upload into the PDF parts that will be pushed to Logics, or into one specific reason it cannot be sent (PUSH-02, decisions D-05 and D-06). The Phase 5 consumer (Plan 03) calls it with `targetBytes = LOGICS_MAX_PART_BYTES` (5,767,168). Pure: no Workers bindings, no logging, no module state; it imports only `./image-to-pdf` and `./split-pdf`.

| Lines | What it does |
|-------|--------------|
| 1-2 | The two helpers: `sniffImage`/`imageToPdf` and `splitPdf`. |
| 4-9 | `NormalizeErrorCode` — the five codes that mean "this file needs manual compression" (table below). |
| 11-16 | `NormalizeResult` — `{ ok: true, parts }`, where each part has a `fileName`, its `bytes`, and its `sha256` hex; or `{ ok: false, code, page? }`. `page` (1-based) is present only for `pdf_page_too_large`. |
| 18-19 | `DEFAULT_MAX_SOURCE_BYTES` — 41,943,040 bytes (40 MiB). Bigger inputs are refused before any parse so one bad file cannot exhaust the 128 MB isolate. Phase 3's bucket cap (about 25 MB) makes this unreachable in practice; it is a second layer. |
| 21 | `PDF_HEADER` — the bytes `%PDF-`. |
| 23-26 | `partFileName(name, k, n)` — strips one trailing `.pdf`/`.jpg`/`.jpeg`/`.png` (any case) and returns `{base}.pdf` when `n === 1`, otherwise `{base} (part k of n).pdf`. Examples: `a.b.pdf` → `a.b (part 2 of 3).pdf`; `scan.JPG` → `scan.pdf`; `noext` → `noext.pdf`. |
| 28-33 | `sha256hex` — `crypto.subtle.digest('SHA-256')` as lowercase hex. Available on Workers and in Node. |
| 39-42 | Size gate first: `bytes.byteLength > maxSourceBytes` → `source_too_large`, before anything is parsed. |
| 44-46 | `input.mime` is ignored; `sniffImage` decides. HEIC → `image_unsupported_format`. |
| 47-53 | JPEG/PNG → a single-page PDF via `imageToPdf`. If pdf-lib cannot embed the bytes (for example a truncated PNG) → `pdf_unparseable`. |
| 54-56 | Not an image: it must start with `%PDF-`, otherwise `pdf_unparseable` — whatever MIME type was declared. |
| 58-63 | `splitPdf(pdf, targetBytes)`. Its errors pass through as `{ ok: false, code }`, adding `page` only for `pdf_page_too_large`. |
| 65-73 | Name and hash each part. A PDF that was not split keeps its **exact** original name and bytes (no rename, no re-save). Wrapped images and split parts are named with `partFileName`. Hashes are computed per part; Plan 03 records them in the push ledger. |
| 74-76 | Invariant: re-check every part against `targetBytes` and throw `normalize_invariant` on a violation. `splitPdf` already guarantees this; the second check means no code path can return an oversize part. |
| 77 | Return the parts in page order. |

## Error codes → `needs_manual_compression`

Every error is terminal for that document: Plan 03 marks the ledger row `failed` with `needs_manual_compression = true`. Staff download the file, compress or unlock it outside ResSpark, and re-upload it to the request item, which creates a new document and a new push. Plan 04 shows this copy:

| Code | When | UI copy |
|------|------|---------|
| `pdf_page_too_large` | one page alone is bigger than the gate (`page` says which) | "One page is too large to send. Compress it outside ResSpark and re-upload." |
| `pdf_encrypted` | the PDF needs a password to open | "This PDF is password-protected. Ask for an unlocked copy." |
| `pdf_unparseable` | not a PDF/JPEG/PNG, damaged, an over-gate PDF with no pages, or an image pdf-lib cannot embed | "This file could not be read as a PDF." |
| `image_unsupported_format` | HEIC/HEIF bytes | "Ask the client to re-upload as JPG or PDF." |
| `source_too_large` | over 40 MB before any processing | "This file is over 40 MB. Compress it outside ResSpark and re-upload." |

## Notes

- Nothing is shrunk by lossy re-encoding, page dropping, or truncation (plan prohibition). A file that cannot fit becomes one of the codes above.
- A PDF at or under the gate is sent as-is even if it is encrypted or slightly damaged; only over-gate PDFs are opened.
- Parts may add up to more than the source (shared fonts and images are copied into each part). That is accepted.

## Tests

- `app/worker/src/pdf/normalize-for-logics.test.ts`:
  - `partFileName` for `a.b.pdf` (2 of 3), `scan.JPG` (1 of 1), and `noext`;
  - a small PDF named `Statement.PDF` at the real gate → one part, same name, same `Uint8Array`, correct SHA-256;
  - a 12-page × 50,000-byte PDF named `Bank statement.pdf` at `200_000` → at least 3 parts named `Bank statement (part k of N).pdf`, each `<= 200_000`, each hash equal to Node's `createHash('sha256')` of its bytes, all hashes distinct;
  - JPEG bytes declared as `image/png`, named `photo.png` → one part `photo.pdf` that loads as a 1-page PDF;
  - HEIC bytes declared as `image/jpeg`, named `IMG_0001.HEIC` → `image_unsupported_format`;
  - 41,943,041 zero bytes → `source_too_large`, and a spy confirms `PDFDocument.load` was never called;
  - a single 300,000-byte page at `200_000` → `pdf_page_too_large`, `page: 1`;
  - text bytes declared as `application/pdf` or `application/octet-stream` → `pdf_unparseable`.
