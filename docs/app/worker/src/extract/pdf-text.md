# `app/worker/src/extract/pdf-text.ts`

Port of `_page_text` in `src/document_parse.py` (RESEARCH Pitfall 10: port the Python reader for exact parity; no `unpdf`, no new dependency). It reads the text-show operators ReportLab writes. A scanned PDF or another generator yields little or no text, exactly as in Python.

## Exports

| Export | What it is |
|--------|------------|
| `PageText` | `{ texts, rows }`. `texts` is every non-empty `(…) Tj` string in stream order. `rows` is `[y, [[x, text], …]]` for every `x y Tm (…) Tj` draw, grouped by `y` in first-seen order (Python dict insertion order). |
| `pageText(bytes)` | Async (inflate uses `DecompressionStream`). Returns `PageText`. |
| `unescape(raw)` | `_unescape`: `\ddd` octal (1-3 digits) becomes that character; `\n`, `\r`, `\t`, `\(`, `\)`, `\\` map to themselves; any other escaped character drops the backslash. |

## How it works, step by step

1. `latin1(bytes)` turns bytes into a string with one character per byte (what `bytes.decode('latin1')` gives). `TextDecoder('latin1')` is not used because browsers and Node map that label to windows-1252. Chunks of 32 KB keep `String.fromCharCode` within argument limits.
2. Every match of `stream\r?\n` starts a body, ending at the next `endstream` (or one byte before the end of the file when there is none, like Python's `data[start:-1]` with `find` returning -1). As in Python, `endstream\n` itself matches, so the region after one stream is also tried; the decoders reject it the same way Python does.
3. The body is stripped of `\r`/`\n` at both ends.
4. A body ending in `~>` is ASCII85-decoded by `a85decode`, a line-for-line port of Python 3.11 `base64.a85decode(adobe=True)`: optional `<~` prefix, `!`-`u` digits in groups of five, `z` for four zero bytes (an error inside a group), whitespace ignored, any other character or a group over 2^32-1 is an error, then the four padding `u`s and the final trim. An error skips the stream (`continue`), like the caught `ValueError`.
5. A body starting with byte `0x78` is inflated by `DecompressionStream('deflate')` (the zlib format). A failure skips the stream, like the caught `zlib.error`.
6. `SHOW` collects `(…) Tj` strings; `PLACED` collects `x y Tm (…) Tj` strings into rows. Both regexes mirror the Python byte patterns: whitespace is ASCII only (`[ \t\n\r\f\v]`, not JS `\s`), and Python's bytes `.` (any byte but `\n`) is written `[^\n]` because JS `.` also refuses `\r`.
7. Each string is unescaped and stripped with Python `str.strip()` rules; empty strings are dropped.
8. `pyFloat` converts the `x`/`y` runs like `float()`; a run such as `1.2.3` throws, as it does (uncaught) in Python. `y` is converted before `x`, matching Python's evaluation order.

## Threat notes (T-07-45)

Streams that fail to decode are skipped, there is no recursion, and Plan 12 caps document count and size before calling `pageText`.
