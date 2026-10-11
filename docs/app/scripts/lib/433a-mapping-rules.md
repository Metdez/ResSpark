# `app/scripts/lib/433a-mapping-rules.mjs`

The reviewed, hand-maintained rules that `app/scripts/build-433a-seed.mjs` turns into
`supabase/migrations/0009_433a_seed.sql`. Nothing at runtime imports this module: the Worker reads the
generated SQL rows (D-08). **USER ACTION:** a CPA/EA reviews these assignments before any real case.

## County rules (ADDR-02, D-12)

| Export | What it is |
|--------|------------|
| `COUNTY_OVERRIDES` | Six Census FIPS codes whose 2025 Gazetteer name does not normalize to the IRS housing row's name. The value is the IRS row's exact county text, checked against the live `housing_utilities_standards` on 2026-10-11. The generator fails if an override text is not a housing county of that state. |
| `USPS_EXTRA` | `PR → Puerto Rico`. `state_aliases` has `puerto rico` but no `pr`, and the IRS publishes Puerto Rico housing standards, so the map keeps its 78 municipios. The alias exists only in the generator; `state_aliases` is unchanged. |
| `CT_OLD_COUNTIES` | The eight Connecticut county FIPS from the Census 2020 county list (`codes2020/national_county2020.txt`). Connecticut replaced counties with nine planning regions in 2022 and the IRS standards use the regions. An old county does not map 1:1 to a region, so these rows have `county` NULL and the lookup shows "Needs data" instead of guessing. |
| `CT_OLD_NOTE` | The note stored on those eight rows. |

| FIPS | Census name | IRS text |
|------|-------------|----------|
| 02063 | Chugach Census Area | `Chugach Census Area, Alaska` |
| 02066 | Copper River Census Area | `Copper River Census Area, Alaska` |
| 17099 | LaSalle County | `La Salle County` |
| 22059 | LaSalle Parish | `La Salle Parish` |
| 35011 | De Baca County | `DeBaca County` |
| 35013 | Doña Ana County | `Dona Ana County` |

## Plaid category rules (FORM-07, D-08)

Line numbers and reliability come from `.planning/research/FEATURES.md` §(f), "433-A Line-Item
Mapping" (Form 433-A Rev. 6-2026). Reliability: A = machine-sourced, high trust; B = needs staff
confirmation; C = not really available from the provider.

| Export | What it is |
|--------|------------|
| `rule(...)` | Private helper that builds one rule object `{ match, treatment, canonical_column, form_line, reliability, note }`. |
| `PFC_RULES` | Ordered rules. `match` is an exact PFC detailed name or a `PREFIX_*` pattern. The first match wins. |
| `pfcDefault(primary)` | The fallback for a name no rule covers: `TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_DISBURSEMENTS` primaries are `exclude`, everything else is `informational` with no column. |

| PFC name(s) | Treatment | Column | Line | Rel. |
|-------------|-----------|--------|------|------|
| INCOME_INTEREST_EARNED, INCOME_DIVIDENDS | income | interest_dividends_royalties | 23 | B |
| INCOME_RETIREMENT_PENSION | income | pension_income | 27-28 | B |
| INCOME_CHILD_SUPPORT | income | child_support_received | 31 | B |
| INCOME_UNEMPLOYMENT, _LONG_TERM_DISABILITY, _MILITARY, _OTHER, v1 INCOME_OTHER_INCOME | income | other_income | 33-34 | B |
| INCOME_SALARY, v1 INCOME_WAGES | informational | gross_wages_taxpayer (hint) | 21-22 | B |
| INCOME_CONTRACTOR, INCOME_GIG_ECONOMY | informational | net_business_income (hint) | 24 | B |
| INCOME_RENTAL | informational | net_rental_income (hint) | 25 | B |
| RENT_AND_UTILITIES_*, LOAN_PAYMENTS_MORTGAGE_PAYMENT | expense | actual_housing_utilities | 37 | B |
| LOAN_PAYMENTS_CAR_PAYMENT | expense | actual_vehicle_loan_lease | 38 | B |
| TRANSPORTATION_GAS, _PARKING, _TOLLS, GENERAL_SERVICES_AUTOMOTIVE | expense | actual_vehicle_operating | 39 | B |
| TRANSPORTATION_PUBLIC_TRANSIT | expense | actual_public_transportation | 40 | B |
| GENERAL_SERVICES_CHILDCARE | expense | actual_child_dependent_care | 44 | B |
| TRANSFER_IN_*, TRANSFER_OUT_*, LOAN_DISBURSEMENTS_*, INCOME_TAX_REFUND, LOAN_PAYMENTS_CREDIT_CARD_PAYMENT | exclude | none | none | A |
| GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT | informational | none | 46/48 | none |
| GENERAL_SERVICES_INSURANCE | informational | none | 39/41/45 | none |
| FOOD_AND_DRINK_*, GENERAL_MERCHANDISE_*, PERSONAL_CARE_* | informational | none | 36 | none |
| MEDICAL_* | informational | none | 42 | none |
| everything else | `pfcDefault` | none | none | none |

The informational hint columns let the bank aggregation (`financial_bank_monthly` in 0008) show
salary deposits, gross receipts and gross rent as cross-checks. They are never proposed as values
(D-09). Tax payments are informational because the recipient is unknown: payments to the IRS are what
the resolution replaces.

## Truv deduction rules (FORM-07, D-08)

| Export | What it is |
|--------|------------|
| `truv(...)` | Private helper that builds one row in `truv_deduction_map` column order. |
| `TRUV_ROWS` | The rows below. `name_pattern` is matched with ILIKE against the deduction name; the lowest `priority` wins for a deduction. Categories are Truv's: memo, medicare, retirement, benefit, socialsec, federal, state, garnishment, local, other. |

| Category | Pattern | Priority | Treatment | Column | Line | Rel. |
|----------|---------|----------|-----------|--------|------|------|
| federal, state, local, socialsec, medicare | `%` | 10 | expense | actual_current_taxes | 46 | A |
| garnishment | `%` | 10 | expense | actual_court_ordered_payments | 43 | B |
| benefit | `%health%`, `%medical%`, `%dental%`, `%vision%` | 10-13 | expense | actual_health_insurance_premiums | 41 | B |
| benefit | `%life%` | 20 | expense | actual_life_insurance_premiums | 45 | C (term vs whole life: staff confirm) |
| benefit, retirement, other, memo | `%` | 99 | informational | none | 49 for retirement | none |

## How to review

A CPA/EA reads the two tables above (or `select * from public.plaid_category_map order by 1` and
`select * from public.truv_deduction_map order by truv_category, priority` live) and confirms each line
assignment before any real case. Every proposal still needs staff acceptance in the worksheet.

## How to change a rule

Edit this file, re-run the generator, and re-apply the seed (see the generator doc). Never edit the
generated SQL. Matching stays exact: add an override for a renamed county rather than loosening the
match.
