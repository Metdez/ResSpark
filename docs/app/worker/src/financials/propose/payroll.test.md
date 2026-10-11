# `app/worker/src/financials/propose/payroll.test.ts`

Unit tests for the `truv` proposer. No database: the admin client is mocked.

| Part | What it does |
|------|--------------|
| `results` and the `../../db/client` mock | A chainable fake query builder. Every awaited query resolves to the next queued `{ data, error }` in call order (connections first, then `truv_deduction_map`). |
| `FIXTURE` | `app/worker/test/fixtures/truv/income_report_proposals.json`: `{ employers: [...] }`, the shape of `connections.data`. Acme Inc (`emp_1`, `BW`, three stubs in Jul-Sep 2026 plus one on 2026-06-30 outside the window) and Beta LLC (`emp_2`, `SM`, two stubs). |
| `row`, `MAP` | Test copies of the seeded `truv_deduction_map` rows. Category strings are allowed here because this is a test file. |
| `WINDOW`, `CONN`, `run`, `col` | The Jul-Sep 2026 window, one connection `conn1`, a call of `payrollProposals`, and a lookup of one column's proposal. |

## Cases

- **Pay frequency codes:** `W`/`BW`/`SM`/`M` map to 52/26/24/12, while `A`, `SA`, `C` and missing give `null`. `SM` is `semimonthly`, and a prototype name such as `toString` is rejected.
- **likeToRegExp:** `%` and `_` behave as in ILIKE, matching ignores case, `+` is escaped, and `\%` matches a literal percent sign.
- **Both employers on the taxpayer:** wages 9341.67, taxes 1410.92 (A), health 260 (B, `Medical PPO` matched by `%medical%`), life 17.33 (C), court-ordered 433.33 (B) and `is_wage_earner` true. There is no `pay_frequency` because `BW` and `SM` disagree, and no proposal for the 401(k) row, which is informational. The June stub is ignored. The wage proposal has five stub refs, and a stub without a check number has no trailing segment in its id.
- **Spouse employer:** with `emp_2` on the spouse, the taxpayer gets 5741.67, the spouse 3600 and `pay_frequency` `biweekly`.
- **Annual employment:** Beta set to `A` drops Beta's wages.
- **Malformed amount:** `gross_pay: 'n/a'` on one Acme stub skips Acme.
- **No report:** returns `null`.
- **proposePayroll:** no connection gives `[]`, connections without a report give `null`, and the full path reads the map and proposes.
