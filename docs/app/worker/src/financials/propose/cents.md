# `app/worker/src/financials/propose/cents.ts`

Integer-cent money helpers for proposals (D-09, RESEARCH "Proposal cents"). Floats and `toFixed` round in binary, so proposal amounts are worked out in whole cents instead. Rounding is half away from zero, like Python's `ROUND_HALF_UP` in the old `document_parse._to_monthly`. The `engine/` never imports this file, because the engine keeps its own Python-parity math.

| Part | What it does |
|------|--------------|
| `MONEY` | The accepted shape once `$`, `,` and whitespace are removed: an optional `-`, digits, and at most 2 decimals. |
| `toCents(amount)` | Takes a string or a number and returns exact integer cents. `'2650.00'` gives 265000, and `'-12.5'` gives -1250. More than 2 decimals (`'1.005'`), junk, or a result above `Number.MAX_SAFE_INTEGER` throws `bad_money`, so a value never silently loses precision. |
| `divHalfUp(numerator, denominator)` | Integer division rounded half away from zero: `sign(n) * floor((2|n| + d) / 2d)`. `divHalfUp(5, 2)` is 3, and `divHalfUp(-5, 2)` is -3. Plan 07 uses it for monthly amounts, for example `divHalfUp(sumGrossCents * 26, stubCount * 12)`. |
| `centsToNumber(cents)` | `cents / 100`. This is the JSON number stored as `proposed_value` for a money column. |
| `parseMoney(text)` | Parses Logics money text: `'$18,450.00'` gives 1845000. Blank, non-string, unparseable or negative input gives `null`, which means no proposal. It never defaults to 0. |
