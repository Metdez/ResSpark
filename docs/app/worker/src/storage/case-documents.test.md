# `app/worker/src/storage/case-documents.test.ts`

Unit tests for the pure helpers of `case-documents.ts` (worker-node project, no network). Run with `pnpm -C app exec vitest run --project worker-node worker/src/storage/case-documents.test.ts`.

| Test | Proves |
|------|--------|
| `safeName` keeps only the base name | `../../etc/passwd` → `passwd` (no path traversal, T-03-01). |
| replaces unsafe characters | `My Statement (Jan).PDF` → `My_Statement_Jan_.PDF`: spaces and brackets become `_`, runs collapse. |
| strips leading dots | `.hidden` → `hidden`, so no hidden object names. |
| falls back to `file` | `''` and `'...'` → `file`. |
| caps the length | 200 characters plus `.pdf` → at most 80. |
| `objectPath` | The exact `firm/f/case/c/item/i/d/My_File.pdf` for a name with `../` segments, and no `..` in the result. |
| `sniffType` detects | `%PDF-1.7` → PDF, `FF D8 FF DB` → JPEG, the 8-byte PNG signature → PNG. |
| `sniffType` rejects | `GIF89a`, a 3-byte prefix of `%PDF`, and an empty array → `null`. |

Helpers: `bytes(...)` builds a `Uint8Array` from numbers; `ascii(s)` encodes a string.
