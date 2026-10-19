# `app/src/features/review/connections/spending-summary.test.ts`

Unit tests for `spending-summary.ts` (`web` project, no DOM). A `tx(over)` builder makes a settled `$10` `FOOD_AND_DRINK_RESTAURANT` row in USD.

| Test | Asserts |
|------|---------|
| `humanizeCategory` | `RENT_AND_UTILITIES` → `Rent and utilities`; `null` → `Uncategorized`. |
| `groupLabel` | `RENT_AND_UTILITIES_RENT` → `Rent`; `LOAN_PAYMENTS_CAR_PAYMENT` → `Car payment`; `RENT_AND_UTILITIES_WATER` → `Utilities`; an unmapped `LOAN_PAYMENTS_OTHER_PAYMENT` → `Loan payments`; `category_detailed` `undefined` → the primary. |
| groups settled outflows | Two rent rows, two utility rows and one restaurant row over 3 months give `Rent 2 / 2400 / 800`, `Utilities 2 / 120.75 / 40.25`, `Food and drink 1 / 25.1 / 8.37`, in that order; `currency` `USD`; `income` `null`. |
| pending and inflows | A pending charge, two `INCOME_WAGES` deposits and a `TRANSFER_IN_DEPOSIT` over 6 months give no expenses and `Income deposits 2 / 6000 / 1000`. |
| edge input | A null-currency row reads `currency: null`; `[]` gives empty groups. |
