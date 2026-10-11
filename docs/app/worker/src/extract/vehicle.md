# `app/worker/src/extract/vehicle.ts`

Port of `_auto`, `_valuation`, `_combine_autos` and `_collected_values` in `src/document_parse.py`.

| Part | What it does |
|------|--------------|
| `VALUE_LABELS` | `Est. Market Value`, `Estimated Market Value`, `Market Value`, in that preference order. |
| `auto(texts)` | With none of `Monthly Payment`, `Remaining Balance`, `Payoff Balance`, `Loan Balance` it is a value-only record (registration or valuation): `vehicle_market_values: [value]`, `vehicle_market_value_total`, `vehicle_count: 1`. Otherwise a loan: `actual_vehicle_loan_lease` (Monthly Payment, required), `vehicle_loan_balances: [balance]`, `vehicle_loan_balance_total`, `vehicle_count: 1`, plus the market value pair when a value label is present. All with `_kind: 'auto'`. |
| `valuation(texts)` | A real-property valuation: `Assessed Value`, `Estimated Market Value` or `Market Value` as `real_property_market_value`, and `has_real_property: true`. |
| `listOf`, `decimalTotal`, `collectedValues` | Python `item.get(key) or []`; an exact decimal sum returned as a float; all market values of value-only files, in order. |
| `combineAutos(statements)` (used by `merge.ts`) | A registration plus a valuation plus a loan is not three cars. With no loan files: every value-only file is one vehicle with a zero loan, and their values (if any) are the market values. With loans: payments add exactly, balances concatenate, the vehicle count is the number of loans, and values come from the loans; if no loan carried a value, value-only files fill the first vehicles in order. |
