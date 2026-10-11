# `app/worker/src/worksheet/text.ts`

Text helpers for the 433-A screening worksheet PDF (Plan 07-06, D-16).

The worksheet uses pdf-lib's standard Helvetica fonts. These fonts encode WinAnsi (Windows-1252) only, as RESEARCH Pattern 6 notes. Client and employer names are free text, so every dynamic string passes through `toWinAnsi` before it is measured or drawn. `@cantoo/pdf-lib@2.11.1` was probed and does not throw on CJK text, but its output for those characters is undefined. The sanitizer makes the result deterministic.

| Part | What it does |
|------|--------------|
| `CP1252_SPECIALS` | The 27 printable Windows-1252 characters in the 0x80-0x9F block (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ). Unicode puts them at other code points, so they get an explicit set. |
| `toWinAnsi(s)` | NFC-normalizes the string first, so `e` plus a combining accent becomes `é`. It then walks the string by code point, which turns an emoji surrogate pair into a single `?`. Control characters (below 0x20, and 0x7F-0x9F except the specials) become a space, so tabs and newlines never break a line. 0x20-0x7E, 0xA0-0xFF and the specials pass unchanged. Everything else becomes `?`. Example: `toWinAnsi('Zoë 王 — ok')` returns `Zoë ? — ok`. |
| `USD` / `money(n)` | `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. `money(1234.5)` returns `$1,234.50` and `money(-3)` returns `-$3.00`. It only formats a number the engine already computed and never rounds or changes one itself. |

Tests: `app/worker/src/worksheet/layout.test.ts` (the `text` block).
