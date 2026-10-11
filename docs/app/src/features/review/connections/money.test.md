# `app/src/features/review/connections/money.test.ts`

Pins the exact display strings of `formatMoney`: `12.34` → `−$12.34` (Unicode minus), `-50` → `+$50.00`, `0` with a `null` currency → `$0.00`, `1234.5` → `−$1,234.50` (grouping).
