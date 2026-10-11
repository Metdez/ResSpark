# `app/worker/src/pdf/split-pdf.ts`

Splits one PDF into parts that are each at most `targetBytes`, keeping page order, or names why it cannot (PUSH-02, decision D-05). Pure: no Workers bindings, no logging, no module state. Phase 5's consumer calls it through `normalizeForLogics` with `targetBytes = LOGICS_MAX_PART_BYTES` (5,767,168).

| Lines | What it does |
|-------|--------------|
| 1 | `PDFDocument` from `@cantoo/pdf-lib` (the maintained pdf-lib fork; see `app/LICENSES.md`). |
| 3-6 | `SplitResult` — either `{ parts }` (each a saved PDF as `Uint8Array`) or an error: `pdf_page_too_large` with the 1-based `page` that alone exceeds the gate, `pdf_encrypted`, or `pdf_unparseable`. |
| 8-13 | Fast path: a file already at or under the gate is returned as the **same** `Uint8Array`, never loaded or re-saved (re-saving could change its size and gains nothing). This also means a small encrypted or damaged PDF passes through untouched; Logics just stores it. |
| 15-20 | Load with `ignoreEncryption: true` so an encrypted file can be detected instead of throwing. Any parse failure → `pdf_unparseable`. |
| 21-27 | If `isEncrypted`, retry with the empty password. Owner-password-only files open this way; a user-password file throws → `pdf_encrypted`. |
| 28-29 | A file over the gate with zero pages would otherwise produce zero parts (nothing sent but no error), so it is reported as `pdf_unparseable`. |
| 31-32 | The `shortcut:` note: the algorithm saves once per page. Upgrade to a byte-ratio estimate plus one verification save if a real upload takes over 20 s. |
| 33-36 | State: finished `parts` (bytes only — no `PDFDocument` is kept after its part is final), the `part` being filled, and `lastGood`, the most recent save of `part` that fit. Every part document is created with `updateMetadata: false`, so pdf-lib writes no `Producer`/`Creator`/`CreationDate`/`ModDate` stamped with the current clock: the same source always splits into byte-identical parts, which the stored-part sha256 re-check in `ensureNormalized` relies on when an interrupted job re-runs. |
| 37-44 | Greedy accumulation: copy page `i` into `part`, save with `objectsPerTick: Infinity` (no yielding; the consumer has no UI to keep responsive), and if the save fits, remember it and continue. |
| 45 | Overshoot with nothing saved yet means page `i` alone is too big → `pdf_page_too_large`, `page: i + 1`. |
| 47-55 | Overshoot after at least one good save: emit `lastGood` as a finished part, start a fresh document with page `i` alone, save it, and if even that is over the gate → `pdf_page_too_large`. Otherwise it becomes the new `lastGood`. |
| 57 | Emit the final part. |
| 59-61 | Invariant: re-check every part against the gate and throw `split_invariant` if one is over. The loop already guarantees this, so it is a thrown bug, never a result — an oversize part is never returned. |
| 62 | Return the parts in page order. |

## Notes

- Parts can sum to more than the source: `copyPages` duplicates shared resources (fonts, images) into each part (RESEARCH Pitfall 4). Accepted — correctness over size.
- Nothing is ever shrunk by re-encoding, dropping pages, or truncation. Anything the splitter cannot fit is an error code the caller turns into `needs_manual_compression`.
- Measured on the test fixture (12 pages × 50,000 random bytes, `targetBytes` 200,000): 4 parts of 151,269 bytes, 3 pages each, about 40 ms in Node 24.

## Tests

- `app/worker/src/pdf/split-pdf.test.ts`:
  - a 2-page file under `5_767_168` comes back as `{ parts: [small] }` and the part is the same `Uint8Array` reference;
  - `makeMultiPagePdf(12, 50_000)` at `200_000`: at least 3 parts, every part `<= 200_000` and loadable, page counts sum to 12, the first part has at least 2 pages (greedy), and the pad indices read back in order `0..11`;
  - `makeOversizedPagePdf(300_000)` at `200_000` → `{ error: 'pdf_page_too_large', page: 1 }`;
  - a 12-page file whose 7th page carries 300,000 bytes (others 20,000) → `{ error: 'pdf_page_too_large', page: 7 }`;
  - `[1, 2, 3, 4, 5]` at `targetBytes 2` → `{ error: 'pdf_unparseable' }`;
  - `makeEncryptedPdf()` at `targetBytes 100` → `{ error: 'pdf_encrypted' }`;
  - every `examples/**/*.pdf` (26 files) at `5_767_168` → `{ parts: [same bytes] }`.
