# `app/src/features/review/connections/money.ts`

`formatMoney(amount, currency)` formats one bank transaction amount for staff (BANK-02; Bigcapital money-formatting reference).

- Plaid reports money leaving the account as a positive number and money coming in as a negative number. Staff read a statement the other way round, so the display flips the sign: `12.34` → `−$12.34`, `-50` → `+$50.00`, `0` → `$0.00` (no sign).
- The magnitude comes from `Intl.NumberFormat('en-US', { style: 'currency', currency })`, which adds the currency symbol, thousands separators and two decimals (`1234.5` → `−$1,234.50`).
- `currency` is the transaction's `iso_currency_code`; `null` falls back to `USD`.
- The minus is the Unicode minus sign `−` (U+2212), which lines up with `+` in a `tabular-nums` column, not the ASCII hyphen.
