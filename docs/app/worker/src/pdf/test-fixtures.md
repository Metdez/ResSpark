# `app/worker/src/pdf/test-fixtures.ts`

Test-only helpers that build the PDFs and image headers the `worker/src/pdf/` tests need. Nothing in production code imports this file, so it never reaches the Worker bundle; it lives next to the modules so the `worker-node` Vitest project (`worker/**/*.test.ts`) can import it.

**Why the fixtures are generated:** every PDF under `examples/` is 2–3 KB, far below any split threshold. The splitter is tested with generated files whose size is controlled exactly, plus a small `targetBytes` (200,000) instead of the real 5,767,168-byte Logics gate.

| Lines | What it does |
|-------|--------------|
| 1-7 | Imports from `@cantoo/pdf-lib`: `PDFDocument` to build files; `PDFName`, `PDFDict`, `PDFStream`, and the `PDFPage` type to read a page's pad back. |
| 9 | `PAD` — the resource name `/RsPad` under which each page's pad stream is registered. |
| 11-18 | `randomPad(size, index)` — `size` random bytes (at least 4). `crypto.getRandomValues` fills at most 65,536 bytes per call, so the loop fills the buffer in 65,536-byte slices. The first 4 bytes are then overwritten with the page index (big-endian uint32) so a test can read back which source page a part's page came from. Random bytes are incompressible, so the file size tracks `size` closely. |
| 20-32 | `makeMultiPagePdf(pages, bytesPerPage)` — one US-letter page per index. `bytesPerPage` is either a fixed number or a function of the 0-based page index (used to make "page 7 alone is oversized"). Each pad is registered as an uncompressed stream (`context.stream` + `context.register`) and attached to the page's `/Resources /XObject` dictionary via `page.node.setXObject`, so `copyPages` carries it into whichever part receives the page. Saved with `useObjectStreams: false` so the structure stays byte-visible. |
| 34-36 | `makeOversizedPagePdf(bytes)` — a one-page file whose single page carries `bytes` of pad. |
| 38-43 | `makeEncryptedPdf()` — a one-page file encrypted with user password `secret` and owner password `owner` via `PDFDocument.encrypt`. Opening it with the empty password fails, which is the `pdf_encrypted` case. |
| 45-51 | `readPadIndex(page)` — looks up `/Resources /XObject /RsPad` on a loaded page and returns the index written into the pad's first 4 bytes. Throws if the page has no pad. |
| 53-54 | `fromHex` — turns a hex string into a `Uint8Array` (used for the two image constants). |
| 56-59 | `TINY_JPEG` — a 332-byte, 1×1 grayscale, baseline (SOF0) JPEG generated once with Pillow. Starts `FF D8 FF`. |
| 61-64 | `TINY_PNG` — a 67-byte, 1×1, 8-bit grayscale PNG with valid CRCs and a real zlib `IDAT` (pdf-lib decodes PNGs, so it has to be genuine). Starts `89 50 4E 47`. |
| 66-69 | `HEIC_STUB` — the 12-byte ISO-BMFF header `00 00 00 18 'ftypheic'`. Not a decodable image; it exists only so the magic-byte sniff sees HEIC. |

## Notes

- Fixture approach: the private per-page stream (the `/RsPad` XObject entry) survives `copyPages` in `@cantoo/pdf-lib` 2.11.1, so the PNG-pad fallback in the plan was not needed.
- The pad is a bare stream without `/Type /XObject`; viewers ignore it because no content stream draws it. It only has to be valid enough for pdf-lib to load, copy, and save.

## Tests

- `app/worker/src/pdf/test-fixtures.test.ts` checks the helpers themselves: `makeMultiPagePdf(12, 50_000)` loads with 12 pages and is at least `12 * 50_000 * 0.9` bytes (the pads are not compressed away); `makeOversizedPagePdf(300_000)` is at least 270,000 bytes and has one page; `TINY_JPEG` starts `FF D8 FF`, `TINY_PNG` starts `89 50 4E 47`, and `HEIC_STUB` has `ftypheic` at offset 4.
