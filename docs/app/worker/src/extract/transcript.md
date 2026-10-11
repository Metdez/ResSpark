# `app/worker/src/extract/transcript.ts`

Port of `_account_transcript` and `_wage_transcript` in `src/document_parse.py`.

## `accountTranscript(texts)`

1. Requires the `Filing Status:`, `Address:`, `(CSED):` and `Request Date:` pairs (`Missing …` lists every absent one).
2. Finds the first line starting with `ACCOUNT BALANCE`; none is a `StopIteration` ("No template matched").
3. Adds the amount after every line that is exactly `150` (transaction code "tax assessed") as exact decimals.
4. Returns, evaluated in Python's key order: `filing_status_married` (filing status starts with "married"), `state_of_residence` (two-letter state before a ZIP), `total_tax_owed` (the amount after the last `:` of the balance line), `tax_only_balance` (the 150 sum quantized to cents with the context default `ROUND_HALF_EVEN`), `csed_months_remaining` (whole months from the request date to the CSED).

## `wageTranscript(texts)`

1. The first line starting with `Box 1` (this also matches `Box 10`, as in Python) gives the amount in the next five lines; no such line is `Wage transcript has no Box 1 wages`.
2. The first line containing `filed by:` gives `_employer`, the stripped text after it; none is a `StopIteration`.
3. `gross_wages_taxpayer` is the annual Box 1 amount divided by 12, half up to cents.
