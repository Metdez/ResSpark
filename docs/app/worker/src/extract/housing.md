# `app/worker/src/extract/housing.ts`

Port of `_lease`, `_mortgage` and `_utility` in `src/document_parse.py`. Each reads `Label:` / value pairs; a missing label is `Missing <first label>`.

| Export | Labels read | Result |
|--------|-------------|--------|
| `lease(texts)` | `Monthly Rent` or `Rent`; `Property Address` | `_kind: 'lease'`, `actual_housing_utilities` (the rent), `state_of_residence`, `rents_home: true`, `owns_home: false` |
| `mortgage(texts)` | `Monthly Payment (PITI)` or `PITI`; `Current Principal Balance` or `Principal Balance`; `Estimated Market Value`; `Property Address` | `_kind: 'mortgage'`, `actual_housing_utilities` (PITI), `real_property_loan_balance`, `real_property_market_value`, `state_of_residence`, `owns_home: true`, `rents_home: false`, `has_real_property: true` |
| `utility(texts)` | `Amount Due`, `Current Charges` or `Total Due` | `_kind: 'utility'`, `actual_housing_utilities` (added to the housing figure by `merge.ts`) |
