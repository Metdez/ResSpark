# `app/worker/src/financials/propose/cents.test.ts`

Unit tests for the proposal money helpers. They need no network.

| Test | Checks |
|------|--------|
| `toCents` exact | `'2650.00'` gives 265000, `'-12.5'` gives -1250, `'$1,234.5'` gives 123450, and the number `42` gives 4200. |
| `toCents` throws | `'1.005'`, `'abc'` and `''` all throw `bad_money`. |
| `divHalfUp` rounding | `(5, 2)` gives 3, `(-5, 2)` gives -3, `(4, 2)` gives 2, and `(0, 7)` gives 0. |
| Biweekly to monthly | `divHalfUp(530000 * 26, 2 * 12)` gives 574167. |
| `parseMoney` | `'$18,450.00'` gives 1845000, and `centsToNumber` turns that into 18450. `''`, whitespace, `'abc'`, `'-5'`, `'1.005'`, `null` and `undefined` all give `null`. |
