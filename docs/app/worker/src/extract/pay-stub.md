# `app/worker/src/extract/pay-stub.ts`

Port of `_pay_stub`, `_PAY_FREQUENCY` and `_TAX_LINES` in `src/document_parse.py`.

| Export | What it does |
|--------|--------------|
| `PAY_FREQUENCY` | Normalized frequency text (lower case, `-` and spaces removed) to the canonical value: `weekly`, `biweekly` (also "every two weeks"), `semimonthly` (also "twice a month"), `monthly`. |
| `TAX_LINES` | The four withholding lines summed into current taxes: Federal Income Tax, Social Security Tax, Medicare Tax, State Income Tax. |
| `payStub(texts)` | Steps, in Python's order: require the `Pay Frequency:` pair; map it (`Unknown pay frequency <text>` when unmapped); gross is the amount after the first line exactly `Regular Gross Pay`, else `Gross Pay`; taxes are the exact decimal sum of the four tax lines (a missing line is zero). Returns `_employer` (first line, stripped), `pay_frequency`, and `gross_wages_taxpayer` / `actual_current_taxes` converted to monthly (`amount * periods per year / 12`, half up to cents; taxes use the absolute value because stubs print them negative). |

`parse.ts` adds `_kind: 'pay_stub'`.
