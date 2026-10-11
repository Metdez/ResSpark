# `app/src/features/uploads/accept.ts`

Decides, before any network call, whether a file the client picked can be uploaded at all (UPL-02). It looks only at the file's name, `type` and `size`; it never reads bytes. The Worker re-checks the real bytes (magic-byte sniff) after the upload, so this module is about fast, friendly refusals, not security.

## Exports

| Symbol | What it is |
|--------|------------|
| `ACCEPTED_EXT` | `['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif']`. Lower-case extensions that are accepted even when the browser leaves `type` empty. |
| `AcceptKind` | `'pdf' \| 'image' \| 'heic'`. Tells `preprocess()` which path to take. |
| `acceptFile(f)` | Returns `{ ok: true, kind }` or `{ ok: false, reason: 'type' \| 'empty' }`. |

## How `acceptFile` decides

1. **Extension.** `extOf` takes the text after the last `.` and lower-cases it (`a.PDF` becomes `pdf`; `archive.pdf.zip` becomes `zip`). A name without a dot has no extension.
2. **Type gate.** The file passes when the extension is in `ACCEPTED_EXT` or the MIME `type` is one of `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`. Otherwise the answer is `reason: 'type'` (shown as "We can take PDFs and photos (JPG, PNG, HEIC).").
3. **Empty gate.** `size === 0` gives `reason: 'empty'`. It runs after the type gate, so an empty `.txt` is reported as the wrong type, not as empty.
4. **Kind.** The extension wins when it is known: `heic`/`heif` give `heic`, `pdf` gives `pdf`, anything else (`jpg`, `jpeg`, `png`) gives `image`. Without a known extension the type decides: `image/heic`/`image/heif` give `heic`, `application/pdf` gives `pdf`, and `image/jpeg`/`image/png` give `image`. The camera on some phones names files without an extension, which is why the type fallback exists.

Why the extension wins: iOS often gives PDFs picked from Files an empty `type`.

## Tests

`accept.test.ts` covers an upper-case `.PDF` with an empty type, HEIC by type and HEIF by extension, PNG and an extension-less JPEG, a `.txt` and a disguised `archive.pdf.zip`, an empty PDF, and an empty `.txt` (type wins over empty).
