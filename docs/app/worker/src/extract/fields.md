# `app/worker/src/extract/fields.ts`

Shared helpers of `src/document_parse.py`, ported with Python `str` and `Decimal` semantics so every extractor returns exactly what the Python oracle returns (Plan 07-11, D-17). No dependency, no I/O.

## Errors

| Part | What it does |
|------|--------------|
| `ExtractError` | Stands for a Python `ValueError` raised by a template. Its message is the Python text verbatim (for example `Missing Pay Frequency`). `parse.ts` re-exports it. |
| `StopIteration` | Stands for a bare `next(...)` that found nothing. `parse.ts` turns it into `ExtractError("No template matched <label>")`, as `_parse_document` does. |
| `Rows` | The `_page_text` rows dict as an ordered array: `[y, [[x, text], …]]`, in Python insertion order. |

Python errors that are **not** `ValueError` (a `KeyError` such as a bank statement without `Account Number:`, or `decimal.InvalidOperation` on a `$1.2.3` run) are thrown as plain `Error`, so callers can tell "template did not match" from "unexpected input", the same split Python's `except (ValueError, StopIteration)` makes.

## Python string behavior

| Part | What it does |
|------|--------------|
| `WS`, `strip`, `WS_RUN`, `pySplit` | Python `str.isspace()` characters (includes `\x1c-\x1f` and `\x85`, which JS `trim()` keeps, and excludes `﻿`, which JS trims). `strip` is `str.strip()`; `pySplit` is `str.split()` with no separator. |
| `pyRepr` | `repr()` of a string for error messages (`No dollar amount in '…'`): picks `"` only when the text has `'` and no `"`, escapes backslash, the quote, `\n`, `\r`, `\t`, and writes other non-printable Latin-1 characters as `\xNN`. Shortcut: characters above Latin-1 are copied as is. |
| `has(head, phrase)` | `re.search(rf"\b{re.escape(phrase)}\b", head)`. Python `\b` on `str` is Unicode-aware, so the port uses look-arounds on `[\p{L}\p{N}_]` instead of JS's ASCII-only `\b`. |

## Decimal

`Dec` is an exact decimal `m * 10^e` (`m` is a `bigint`). It reproduces `Decimal(str(float))` arithmetic without floating error.

| Part | What it does |
|------|--------------|
| `dec(value)` | Parses a number (via `String(n)`, whose shortest round-trip digits equal Python `str(float)`) or a decimal string, exponent forms included. An invalid string throws `InvalidOperation`. |
| `ZERO`, `add`, `sumDec`, `absDec` | Exact addition, left-to-right sum from zero (Python `sum(..., Decimal(0))`), and `abs`. |
| `toFloat` | `float(Decimal)`: `Number("<m>e<e>")`, which is correctly rounded like Python. |
| `cents(value, divisor, halfUp)` | `(value / divisor).quantize(Decimal("0.01"), rounding)`: exact rational division rounded to cents. `halfUp` is `ROUND_HALF_UP` (ties away from zero); otherwise `ROUND_HALF_EVEN`, the context default used by `_account_transcript`. Shortcut noted in code: Python first rounds the quotient to 28 significant digits; that only matters within 1e-26 of a half-cent tie. |

## Ported helpers

| Part | Python | Notes |
|------|--------|-------|
| `money` | `_money` | First `\$[0-9,.-]+` run, `$` and commas removed, then `float(Decimal(...))`. No run: `ExtractError("No dollar amount in <repr>")`. A run that is not a decimal literal (for example `$1.2.3`) throws plain `Error` like Python's `InvalidOperation`. |
| `PAY_PERIODS`, `toMonthly` | `_PAY_PERIODS`, `_to_monthly` | `amount * periods / 12` to cents, half up. |
| `pairs` | `_pairs` | Every line ending in `:` (except the last line) maps its stripped label to the stripped next line; a later label overwrites an earlier one but keeps its position (a `Map`, like a dict). |
| `requireLabels` | `_require` | `Missing a, b` listing every absent label. |
| `pick` | `_pick` | First present label; otherwise `Missing <first label>`. |
| `nextMoney` | `_next_money` | The first of the next five lines containing `$`; otherwise `No amount after <repr>`. |
| `firstLabeled` | `_first_labeled` | First line exactly equal to each label in turn (not stripped), then `nextMoney`. |
| `labeledAmount` | `_labeled_amount` | A `Dec`; a missing line is zero, a present line with no amount still fails. |
| `IsoDate`, `pyDate` | `_date` | `strptime` with `%m/%d/%Y` then `%m-%d-%Y` on the stripped text, using the same per-field patterns as CPython's `_strptime` (month `1[0-2]|0[1-9]|[1-9]`, day also allows a leading space, four-digit year) and calendar validation (leap years). Returns `YYYY-MM-DD`, the same text as `date.isoformat()` in the fixtures. Failure: `Bad date <repr>`. |
| `monthsBetween` | `_months_between` | Whole months, minus one when the end day is before the start day. |
| `stateCode` | `_state_code` | `\b([A-Z]{2})\s+\d{5}\b` with Unicode `\s`, `\d` and `\b`; failure: `No state in <repr>`. |
