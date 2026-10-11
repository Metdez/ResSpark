# `app/worker/src/extract/bank-statement.ts`

Port of `_bank_statement`, `_statement_balance`, `_combine_banks` and `_same_payer` in `src/document_parse.py`.

## `bankStatement(texts, rows)`

1. The header is the first row (in `rows` order) whose cell texts include both `Withdrawals` and `Deposits`; none is a `StopIteration`.
2. `columns` maps each header cell named Date, Description, Withdrawals, Deposits or Balance to its `x` (a repeated name keeps its first position and takes the later `x`, like a dict).
3. Every row above the header (`y` smaller than the header's `y`; PDF `y` grows upward) puts each cell into the nearest column by `|x - column x|`, the first column winning a tie like `min()`. A header without `Description` is Python's `KeyError: 'Description'` (plain `Error`).
4. A row with a non-empty description adds `[description, amount]` for each Deposits cell containing `$`.
5. `Ending Balance:` line, the `MM/DD/YYYY - MM/DD/YYYY` period line and the `Account Number:` pair are then required (missing lines are `StopIteration`; a missing account number is `KeyError: 'Account Number'`).
6. Returns `_account`, `_period_end` (the period's end date as `YYYY-MM-DD`), `_deposits`, `ending_balance`.

## `samePayer(description, employer)`

Both lower-cased with whitespace runs collapsed. The "named" part of the description is the text after the first ` - `. A match is either text containing the other, or the employer starting with the named part, or the named part starting with the employer.

## `combineBanks(statements, employers)` (used by `merge.ts`)

1. Keeps the latest statement per `_account` (by `_period_end`); statements without an account or period (model-filled ones) are all kept as `loose`.
2. `cash_and_bank_balances` is the exact sum of each kept statement's `ending_balance` (or `cash_and_bank_balances`), latest-per-account first, then loose.
3. With no known employer or no statement period, it stops there: the unexplained-deposit flag stays unknown instead of a false zero.
4. Otherwise every deposit, across all statements, whose description matches no employer is unexplained. `has_unexplained_deposits` is whether that sum is positive; `unexplained_deposits_monthly` is the sum divided by the number of distinct statement months, half up to cents.
