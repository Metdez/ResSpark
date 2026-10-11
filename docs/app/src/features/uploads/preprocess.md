# `app/src/features/uploads/preprocess.ts`

Shrinks, converts and hashes a file on the phone before it is uploaded (D-02, UPL-02). Phone photos are often 3–12 MB at 4,000 px; a document needs far less, and a smaller file uploads faster on a weak signal.

## Exports

| Symbol | What it is |
|--------|------------|
| `MAX_EDGE` | `2000`. The longest edge, in pixels, a photo keeps after resizing. |
| `JPEG_QUALITY` | `0.82`. JPEG quality for every re-encoded photo and for HEIC conversion. |
| `UploadMime` | `'application/pdf' \| 'image/jpeg' \| 'image/png'`, the three types the `case-documents` bucket accepts. |
| `Processed` | `{ blob, mime, name }`, what `preprocess` returns and what the sheet uploads. |
| `fitWithin(w, h, maxEdge = MAX_EDGE)` | New `{ w, h }` with the long edge at most `maxEdge`, keeping the ratio. It never upscales: a 1200×800 photo stays 1200×800. It uses integer math (`floor(w * maxEdge / long)`) so 3000×6000 lands exactly on 1000×2000 instead of 999×2000. |
| `sha256Hex(blob)` | Web Crypto `crypto.subtle.digest('SHA-256', …)` over the blob's bytes, as lower-case hex. The Worker stores it with the document (D-03) so the push phase can re-check it. |
| `preprocess(file, kind)` | Runs the path for the `kind` from `acceptFile`. |

## `preprocess` paths

- **`pdf`:** returned untouched (`mime: 'application/pdf'`, original name). No canvas work.
- **`heic`:** `heic2any` is loaded with `await import('heic2any')` only here, so PDF and JPG users never download it (it is a large WASM build of libheif). It converts the file to JPEG at `JPEG_QUALITY`; it can return one `Blob` or an array, and the first is used. The result then goes through the image path below. If the conversion throws, `preprocess` throws `Error('heic_failed')`, shown as "We couldn't read that photo. Try a JPG or PDF." HEIC bytes are never uploaded, because the bucket would refuse them.
- **`image`:** `toJpeg` decodes with `createImageBitmap`, sizes with `fitWithin`, and draws onto an `OffscreenCanvas` (or, on browsers without one, a detached `<canvas>`). `draw` first fills white so transparent PNG pixels do not turn black in the JPEG, then draws the bitmap. The canvas is exported as JPEG at `JPEG_QUALITY` (`convertToBlob`, or `toBlob` wrapped in a Promise). The bitmap is always closed in `finally`. The new name is the original base name plus `.jpg` (`IMG_1.png` becomes `IMG_1.jpg`).
- **Fallback (`shortcut:`):** if anything in the image path throws (an old browser, a photo the browser cannot decode, no 2D context), the original file is returned unchanged, with `mime` `image/png` for a PNG (by type or `.png` name) and `image/jpeg` otherwise. A converted HEIC that then fails to resize is returned as the converted JPEG. The Worker still sniffs the bytes and caps the size at 25 MB, so the fallback cannot sneak a wrong type in. Upgrade trigger: tell the user if this ever shows up in support.

The 25 MB limit is checked by the upload sheet on the processed blob, not here.

## Tests

`preprocess.test.ts` (jsdom) stubs `createImageBitmap` and `OffscreenCanvas` with `vi.stubGlobal` and mocks `heic2any` with `vi.mock`. It covers `fitWithin` (shrink both orientations, no upscale), the SHA-256 of `abc`, PDF pass-through without touching the canvas, a 4000×3000 PNG resized to 2000×1500 and exported as `{ type: 'image/jpeg', quality: 0.82 }` with a `.jpg` name, the decode-failure fallback for JPG and PNG, the HEIC path (heic2any called with `{ blob, toType: 'image/jpeg', quality: 0.82 }`, then resized to 1500×2000), and `heic_failed`.
