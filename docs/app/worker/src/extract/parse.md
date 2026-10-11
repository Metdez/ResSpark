# `app/worker/src/extract/parse.ts`

Port of `parse_texts`, `parse_pdf`, `_parse_document` and `_from_kind` in `src/document_parse.py`, **without the OpenRouter fallback** (D-17, PROD-04; the fallback stays Phase 8). Plan 12 turns the result into document-source proposals.

| Export | What it does |
|--------|--------------|
| `ParsedDocument` | The parsed columns plus `_kind` (which template matched) and any `_`-prefixed working keys (`_employer`, `_account`, `_period_end` as `YYYY-MM-DD`, `_deposits` as `[description, amount]` pairs). |
| `ExtractError` | Re-exported from `fields.ts`; carries the Python `ValueError` message verbatim. |
| `parseTexts(texts, rows, documentType)` | `parse_texts`: label `document`. |
| `parsePdf(bytes, documentType, label = 'document')` | `parse_pdf`: `pageText`, then the same parse. `label` replaces Python's `str(path)` in "No template matched <label>"; the parity test passes the repo-relative path. |

## `parseDocument` (private)

1. `classify` picks the kind.
2. No kind: `ExtractError("No template matched <label>")`.
3. `fromKind` runs that kind's parser (see the dispatch table below).
4. A `StopIteration` becomes `ExtractError("No template matched <label>")`; an `ExtractError` is rethrown unchanged. Python would try the model here; with the model unavailable it re-raises the same error, which is what this port always does.
5. Exception kept from Python: for kind `bankruptcy`, `_fields_for` looks the kind up in `_KIND_FIELDS`, which has no `bankruptcy` entry, so Python raises `KeyError: 'bankruptcy'`; the port throws a plain `Error` with that text.
6. Any other error (a Python `KeyError` or `InvalidOperation`) passes through as a plain `Error`.

## `fromKind` dispatch

| Kind | Parser | Result |
|------|--------|--------|
| `account` | `accountTranscript` (`transcript.ts`) | `_kind: 'account'` plus the account columns |
| `wage` | `wageTranscript` (`transcript.ts`) | `_kind: 'wage'`, `_employer`, monthly gross |
| anything else | — | `No template matched` |
