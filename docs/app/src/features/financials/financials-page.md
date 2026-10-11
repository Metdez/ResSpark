# `app/src/features/financials/financials-page.tsx`

`FinancialsPage({ caseId })`: the staff 433-A worksheet (D-12, D-14, D-15, FORM-03, FORM-04, FORM-05, ADDR-02). The route file supplies `caseId` and the page chrome.

| Part | What it does |
|------|--------------|
| `Title` | The UI-SPEC Display role (24 px / 600, one per page): `433-A worksheet for {First Last}`, or `433-A worksheet`. |
| `countyText(county)` | The county state as text, and whether it is a warning. `confirmed_address`: `{IRS county} (FIPS {fips})`. `from_other_address`: the county, then `from an address the client has not confirmed`. `ct_old_county`: names the old Connecticut county code and asks for the address to be re-confirmed (IRS standards use planning regions). `not_in_irs_table`: `{Smarty county} (FIPS {fips}) is not in the IRS housing table`. `waiting_for_address`: `Needs data — waiting for the client's address`. |
| `CountyRow` | The `County` label, the text (warning tone from `TONE_CLASSES` when it needs attention) and an `Address` source badge once an address exists. Display only: there is no county select or text field anywhere (D-12). |
| `Employers` | Each payroll employer (`Unnamed employer` without a name) with a `Truv` badge and a `Taxpayer` / `Spouse` two-button group (`aria-pressed`). Switching calls `useRefresh(caseId).mutate({ spouse_employer_ids })` with the employer added to or removed from the saved list, which re-runs the payroll proposer. With none: `No payroll connection yet.` |
| Queries | `useFinancials(caseId)` (polled every 5 s) and `useLatestEvaluation(caseId)` (the run that feeds the expense columns). |
| Pending | The title and three `Skeleton` rows. |
| Error | The title and a destructive `Alert`: `Couldn't load the 433-A worksheet`, the generic staff copy, and the muted error code. |
| Header | `FinancialsHeader`. |
| Layout | A two-column grid on large screens, `lg:grid-cols-[minmax(0,1fr)_360px]`: the sections on the left, an `aside` labelled `Recommendation` on the right holding `RecommendationRail` (sticky on large screens; see `recommendation-rail.md`). A `div`, not a second `main`: the route's `Main` is the page landmark. |
| Sections | One `SectionTable` per view section, in the Worker's order (D-14 form order), each given the latest run. The Household section gets `CountyRow` and the Employment section gets `Employers` above its table. |

## Tests

`financials-page.test.tsx` (`web` project; `./api` partially mocked, `sonner` and `@/lib/supabase` mocked):

- the seven section titles in D-14 order, each with an expanded collapse button; clicking one collapses it;
- `12 of 64 required facts confirmed`, `Jul 1, 2026 – Sep 30, 2026`, `3 months` pressed; `6 months` sends `{ window_months: 6 }`; `Refresh proposals` sends `{}`;
- `Accept all proposed in this section` in Monthly income calls decide once, for the single-proposal line, and skips the competing one;
- the county states: `Needs data — waiting for the client's address`; `Los Angeles County (FIPS 06037)` with `Address`; the old Connecticut code with the re-confirm request; the not-in-table warning naming the Smarty county; and no `select`, `input`, combobox or listbox on the page;
- two employers listed; `Spouse` on the second sends `{ spouse_employer_ids: ['emp_2'] }`.
