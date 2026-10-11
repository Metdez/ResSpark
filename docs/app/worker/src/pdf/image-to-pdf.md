# `app/worker/src/pdf/image-to-pdf.ts`

Decides what an uploaded image really is from its first bytes, and wraps JPEG/PNG images into a PDF (PUSH-02, decision D-05). Logics receives PDFs only, and the stored MIME type is never trusted. Pure: no Workers bindings, no logging.

| Lines | What it does |
|-------|--------------|
| 1 | `PDFDocument` from `@cantoo/pdf-lib`. |
| 3 | `ImageKind` — `'jpeg' \| 'png' \| 'heic'`. |
| 5 | `HEIF_BOXES` — the ISO-BMFF `ftyp` box plus the major brands iPhones and other HEIF writers use: `heic`, `heix`, `mif1`. |
| 7-8 | `startsWith(bytes, signature)` — true when the first bytes equal `signature`. Short inputs simply fail the comparison. |
| 10-17 | `sniffImage(bytes)` — `FF D8 FF` → `jpeg`; `89 50 4E 47` → `png`; bytes 4–11 equal to `ftypheic`/`ftypheix`/`ftypmif1` → `heic`; anything else (including a PDF and inputs shorter than the signature) → `null`. These are the same magic bytes Phase 3's upload sniff uses. |
| 19-35 | `imageToPdf(images)` — one new document, created with `updateMetadata: false` so no clock-stamped Info dictionary is written and the same images always give the same bytes (and sha256); for each image, `embedJpg` or `embedPng` (chosen by the caller from `sniffImage`, never from a MIME type), a page exactly `width × height` points (1 pixel = 1 point), and `drawImage` covering the whole page. Saved with `objectsPerTick: Infinity`. Throws if pdf-lib cannot embed the bytes; `normalizeForLogics` turns that into `pdf_unparseable`. |

## Notes

- HEIC is recognised but never converted: there is no HEIC decoder on Workers and this phase adds none (plan prohibition). Phase 3 converts HEIC to JPEG in the browser; a HEIC that still reaches the Worker becomes `image_unsupported_format`.
- `embedJpg` reads the JPEG header for dimensions and passes the compressed data through unchanged; `embedPng` decodes and re-encodes the PNG. Neither lowers image quality.

## Tests

- `app/worker/src/pdf/image-to-pdf.test.ts`:
  - `sniffImage` returns `jpeg` for `TINY_JPEG`, `png` for `TINY_PNG`, `heic` for `HEIC_STUB`, `null` for `%PDF` and for a 3-byte input;
  - the `heix` and `mif1` brands are also `heic`;
  - `imageToPdf` of the 1×1 JPEG and PNG produces a loadable 2-page PDF whose pages are each 1 × 1 points;
  - with `Date` faked and set five minutes apart, two `imageToPdf` calls on the same JPEG return equal bytes.
