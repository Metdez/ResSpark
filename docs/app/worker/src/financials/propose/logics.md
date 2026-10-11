# `app/worker/src/financials/propose/logics.ts`

The `logics` proposer (D-09). It re-reads Logics `Case/CaseInfo` at job time through `ctx.logicsCaseInfo()` and proposes three household and liability facts.

Privacy rule (Phase 2 C8/M6): the DOB, the MaritalStatus text and the TaxLiability text are only read in memory here. Only the derived value (true/false, an age, a number) is stored as a proposal. Refs carry the Logics field name, never the raw text, and nothing is logged.

| Part | What it does |
|------|--------------|
| `maritalFromLogics(value)` | Trims the value and ignores case. `Married` gives `true`. `Single`, `Divorced` and `Widowed` give `false`. Anything else, such as `Separated`, a blank or a non-string, gives `null`, which means no proposal. |
| `ageOn(dob, now)` | Accepts `MM/dd/yyyy` (the documented CaseInfo format) or an ISO `yyyy-mm-dd...` prefix. It checks that the calendar date is real by rebuilding it in UTC, so `02/30/1990` is rejected. It returns full years on `now` in UTC, one less when the birthday is later in the year. An invalid date, a future date, or an age over 120 gives `null`. |
| `ref(field)` | `[{ kind: 'logics_field', id: field, label: 'Logics <field>' }]`. |
| `proposal(...)` | Builds one `ProposalInput` with no window. |
| `proposeLogics(ctx)` | `null` when there is no CaseInfo (no Logics case, or Logics not configured), so old rows are kept. Otherwise it returns `{ source: 'logics', proposals }`, holding only the facts that parsed. |

## Proposals

| Column | From | Reliability | Method |
|--------|------|-------------|--------|
| `filing_status_married` | `MaritalStatus` via `maritalFromLogics` | A | `logics_marital_status` |
| `age_taxpayer` | `DOB` via `ageOn(dob, ctx.now)` | A | `logics_dob_age` |
| `total_tax_owed` | `TaxLiability` via `parseMoney`, then `centsToNumber` | B (case-manager entry, not an IRS transcript) | `logics_tax_liability` |

A blank or unparseable field produces no proposal for that column, never a 0 or `false` (PITFALLS M7). If every field is blank, the result is `[]`, and the old `logics` rows are superseded.
