# Phase 7 — API Coverage Decision Matrix

> Produced by gsd-planner because the Phase 7 plans read vendor data in new ways (Plaid balances and the PFC taxonomy, stored Truv report fields, Logics CaseInfo financial fields, Smarty US Street for non-confirmed addresses) and push a new document type to Logics. Default is `INTEGRATE`; every `OPT-OUT` carries a one-line reason. Surfaces owned by earlier phases are listed only where Phase 7 changes how they are used; see the Phase 2, 4, 5 and 6 `COVERAGE.md` files for the rest.

| capability | decision | reason |
|------------|----------|--------|
| Plaid: `POST /accounts/get` balances | INTEGRATE | Plan 07 `plaid/accounts.ts`, one call per bank reconcile → `bank_accounts.balance_*` → `cash_and_bank_balances` (D-09 as corrected by RESEARCH: `/transactions/sync` `accounts[]` is incomplete). Supersedes the Phase 4 opt-out for 433-A cash only |
| Plaid: `POST /accounts/balance/get` (real-time) | OPT-OUT | billed per call; the as-of balance captured at reconcile is what the worksheet needs |
| Plaid: PFC taxonomy CSV (`pfc-taxonomy-all.csv`) | INTEGRATE | Plan 03 build-time input → `plaid_category_map` (127 v2 + 3 v1 rows, D-08, FORM-07) |
| Plaid: `personal_finance_category` v2 on `/transactions/sync` | INTEGRATE (Phase 4) | already requested in 04-04 (`options.personal_finance_category_version: 'v2'`); Phase 7 maps it |
| Plaid: `/transactions/recurring/get` | OPT-OUT | recurring streams are deferred (CONTEXT Deferred) |
| Truv: stored income report `employments[].pay_frequency`, `statements[].{pay_date, gross_pay, deductions[]}` | INTEGRATE | Plan 07 `propose/payroll.ts` reads `connections.data.employers[].report` (no new API call) (D-09) |
| Truv: `gross_pay_ytd` / `annual_income_summary` wage methods | OPT-OUT | D-09 fixes the method: mean gross per stub × periods ÷ 12 |
| Truv: W-2 wages for monthly income | OPT-OUT | annual figures are not the 433-A monthly method; W-2 PDFs stay documents |
| Truv: `/employment/report/` | OPT-OUT | employer name and frequency already come from the income report |
| Logics: `GET Case/CaseInfo` → `DOB`, `MaritalStatus`, `TaxLiability` | INTEGRATE | Plan 05 `propose/logics.ts`, read at job time, only derived proposals stored (D-09; Phase 2 C8/M6 forbids storing the raw fields) |
| Logics: `GET Case/CaseInfo` → `Address`, `AptNo`, `City`, `State`, `Zip` | INTEGRATE | Plan 05 county fallback through Smarty when no confirmed address exists (D-12) |
| Logics: `SpouseDOB` | OPT-OUT | a create/update field, not returned by CaseInfo; spouse age comes from intake or staff |
| Logics: `POST Case/UpdateCase` (write values back) | OPT-OUT | Logics stays the system of record; ResSpark writes documents and notes only |
| Logics: `POST Documents/CaseDocument` for `worksheet_433a` | INTEGRATE | Plan 06 through the Phase 5 ledger and push card (D-16, FORM-06) |
| Smarty: US Street `street-address` (`metadata.county_fips`, `county_name`) for manual and Logics addresses | INTEGRATE | Plan 05 via Phase 6 `verifyStreet` (D-12, open question 5) |
| Smarty: Autocomplete Pro | OPT-OUT (Phase 6) | returns no county; Phase 6 owns the client address step |
| Smarty: Connecticut FIPS behavior (old county vs planning region) | INTEGRATE (guarded) | old county codes map to Needs data in `county_fips_map`; one live Hartford check is a USER ACTION once keys exist (open question 4) |
| Census: 2025 Gazetteer counties (`2025_Gaz_counties_national.zip`) | INTEGRATE | Plan 03 build-time input → `county_fips_map` (ADDR-02) |
| Census: `national_county2020.txt` | OPT-OUT (main map) | still lists the 8 old Connecticut counties; only those 8 FIPS/names are copied, cited, as Needs-data rows |
| IRS: Collection Financial Standards pages (effective 2026-06-29) | INTEGRATE (reference) | `standards_versions` row and the names-only Connecticut correction cite them (Plan 02); no amount changes |
| IRS: official Form 433-A / 433-A(OIC) PDFs | OPT-OUT | filling official forms is deferred; the worksheet is labeled "Not an IRS form" (CONTEXT Deferred) |
| OpenRouter (LLM extraction fallback) | OPT-OUT | Phase 8 (PROD-04); Phase 7 calls no LLM (D-20) |
| Cloudflare Queues: `financials_propose` job on `resspark-jobs` | INTEGRATE | Plan 05 (D-07) |
| Supabase Storage: worksheet PDFs in `case-documents` | INTEGRATE | Plan 06 (D-16) |
| Web platform: `DecompressionStream('deflate')` for PDF text | INTEGRATE | Plan 11 `_page_text` port (no `unpdf`, RESEARCH Pitfall 10) |
