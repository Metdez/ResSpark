# `app/worker/src/financials/propose/logics.test.ts`

Unit tests for the Logics proposer. They need no network. `ctx(info)` builds a `ProposeContext` whose `logicsCaseInfo()` returns `info` (or `null`), with `now` fixed at 2026-10-11 UTC.

| Test | Checks |
|------|--------|
| `maritalFromLogics` | `Married` gives `true`. `' single '`, `Divorced` and `WIDOWED` give `false`. `Separated`, `''` and `undefined` give `null`. |
| `ageOn` full years | `07/24/1980` and `1980-07-24T00:00:00` give 46. |
| `ageOn` birthday later this year | `12/01/1980` gives 45. A birthday on the job date (`10/11/1980`) gives 46. |
| `ageOn` invalid | `13/45/1980`, `02/30/1990`, a future date, an age over 120, `soon` and `''` all give `null`. |
| `proposeLogics` three proposals | Married `true` (A), age 46 (A), liability 18450 (B), with the right methods. Refs are `logics_field` with ids `MaritalStatus`, `DOB` and `TaxLiability`, and the output holds neither the DOB nor the liability text. |
| Blank fields | They give `{ source: 'logics', proposals: [] }`. |
| No Logics case | It gives `null`. |
