# Phase 7: 433-A Pre-Population - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 turns the data collected in Phases 2-6 into a 433-A screening worksheet that staff review. It delivers:
1. A mechanical TypeScript port of the Python engine (`determination`, `FinancialData`, standards repository, `intake_workflow`), proven by golden fixtures exported from Python. Python stays unchanged as the oracle.
2. The 28-question intake step in the client portal, pre-filled where possible.
3. A proposals layer: Truv, Plaid, intake, Logics, the address and (final wave) ported document extractors propose values with source and evidence. Only staff-accepted values enter `case_financial_data`.
4. IRS standards from Postgres functions, keyed by the county of the confirmed address. No county dropdown.
5. The staff 433-A view with the engine's recommendation and math.
6. A worksheet PDF labeled "Not an IRS form", pushed through the Phase 5 ledger.

Requirements: FORM-01..07, ADDR-02. Out of scope: official IRS form PDFs, 433-F / 433-A(OIC) layouts, an OIC offer calculation, any change to thresholds, formulas, eligibility gates or recommendation wording, and any LLM call.

</domain>

<decisions>
## Implementation Decisions

Discussion ran in `--auto` mode (non-interactive). Each decision is the recommended option, chosen from PROJECT.md (Andrew's words), research SUMMARY conflicts 1/1a, FEATURES §(f), and the Phase 1-5 contexts. Override here before planning.

```
[auto] Selected all gray areas: engine location + oracle; proposed vs confirmed; badges + drill-down; mapping tables; standards + county; intake; recommendation; worksheet; document_parse port; layout; data + routes.
[auto] Engine -> worker-only app/worker/src/engine/ + one shared question module | Oracle -> Python-exported golden JSON in Vitest + freshness check
[auto] Values -> financial_proposals; one RPC is the only writer to case_financial_data | Mappings -> seeded SQL tables
[auto] Standards -> verbatim SQL functions + one bundle RPC (engine stays sync) | County -> FIPS from confirmed address -> IRS name; Logics address via Smarty as fallback; never a dropdown
[auto] Worksheet -> @cantoo/pdf-lib via Phase 5 ledger | document_parse -> final non-gating wave, regex only | Layout -> statement sections + rail; interview = USER ACTION | Migration -> 0008 (+0009 seed if needed)
```

### Engine port and the Python oracle (FORM-01)
- **D-01:** The engine runs only in the Worker, in `app/worker/src/engine/`: `financial-data.ts` (every field of `src/financial_data.py`, `REQUIRED_FINANCIAL_COLUMNS`, `financialDataFromCaseRow` throwing `MissingFactError(columns)`), `standards.ts` (`StandardsRepository` with the six sync methods, the facade, `StandardsLookupError`), `determination.ts` (1:1 port), `intake-workflow.ts` (`missingQuestionIds`, `missingFinancialColumns`, `documentRequestsFor`, `evaluateCase`), and `outcome.ts` (the `_PATHS` id/short-label map and the `_NEXT` sentence from `src/case_api.py`). Nothing in `engine/` imports Hono, Supabase, `fetch` or `Date`; a grep check enforces it. The SPA shares only `app/shared/questions.ts` (D-04). — **Reversibility:** costly — routes, worksheet and parity tests import these paths.
- **D-02:** The port is mechanical. Plain `number` (no Decimal, no cents). Same operation order: `Math.ceil((owed / months) * 100) / 100`, the same `max`/`min` nesting, and expense keys in Python dict order so `total` sums in the same order. Every constant stays inline where Python has it (`1000`, `0.8`, `3450`, `11980`, `500`, `50_000`, ages `30`/`65`, CSED clamp `1`), each with a comment citing the Python line and the 433-A(OIC) line. `path` and `reason` strings are byte-identical, because they are the recommendation wording. The `csed_months_remaining <= 0` behavior and the two-condition compliance gate stay exactly as they are. `calculateNetRealizableEquity` returns the sum of `netRealizableEquityLines(fd)` in Python's order, so the view can show each line without a second implementation of the math.
- **D-03:** Golden fixtures come from a new stdlib script, `src/tools/export_golden_fixtures.py` (with companion doc). It imports the unchanged `src/*.py`, builds a fake standards table data-identical to `FakeStandardsRepository` in `src/tests/test_intake_workflow.py`, and writes `app/worker/test/fixtures/engine/golden.json` as `{ standards, questions, cases: [{ name, row, expected }] }`. `expected` holds the workflow status, missing ids and fields, review flags, document request codes, the allowable breakdown, and every `Determination` field. Cases are every determination scenario in the existing 27 tests plus a generated grid of at least 60 rows: both compliance reasons, NRE 500/500.01, owed 50,000/50,000.01, CSED 0/1, per-vehicle list vs legacy totals, the joint-offer second-vehicle exemption, ages 64/65, household 1-6, vehicles 0-3, and one NULL per required column (must give `information_needed`). `engine/parity.test.ts` (project `worker-node`) asserts exact `toEqual`, never `toBeCloseTo`. `pnpm check` gains `python src/tools/export_golden_fixtures.py --check`, which fails on a stale fixture. The 27 Python unittest tests keep running unchanged.
- **D-04:** `app/shared/questions.ts` holds the 28 declarations (ids, prompts, types copied verbatim from `src/questions.py`), the three `_is_applicable` rules, `INITIAL_QUESTION_IDS`, `validateAnswer`, and UI metadata (section, options, help text) from `src/frontend/src/questions.ts`, minus the state and county options. A parity test checks it against `golden.json.questions`; a live test checks it against the 28 `question_definitions` rows. `src/frontend/`, frozen since Phase 1 D-01, is deleted at the end of this phase, including `counties.generated.ts`.

### Proposed versus confirmed (FORM-03, FORM-04)
- **D-05:** New table `financial_proposals`: `id`, `firm_id`, `case_id`; `canonical_column` (must be a `case_financial_data` column); `proposed_value jsonb`, never JSON null (no data means no row); `source` in truv|plaid|intake|logics|address|document|staff; `source_refs jsonb` array of `{kind, id, label}` with kind in bank_transaction|bank_account|pay_stub|w2|income_report|intake_answer|logics_field|address|document; `method` (e.g. `mean_gross_pay_x_periods_div_12`, `sum_outflows_3mo_div_3`); `window_start`, `window_end`; `reliability` A|B|C; `status` proposed|accepted|edited|rejected|superseded; `decided_value`, `decision_note`, `decided_by`, `decided_at`; `generator_version`, `created_at`. A partial unique index allows one `proposed` row per (`case_id`, `canonical_column`, `source`). Same design research called `data_suggestions`. The baseline `document_extractions` table stays unused and unchanged. — **Reversibility:** one-way — this table is the evidence trail behind every confirmed value; reshaping it later needs a data migration.
- **D-06:** Only one thing writes to `case_financial_data`: RPC `financial_value_decide(p_case_id, p_column, p_action, p_value, p_proposal_id, p_note, p_actor_id)`. Actions: `accept`; `edit` (note required); `known_zero` (writes 0, source `staff`); `unknown` (writes NULL); `reject` (proposal only). In one transaction it creates the row with every column NULL if absent, sets that one column, updates the proposal, and logs `financial.value_<action>`; the logger never logs values. "Accept all proposed in this section" calls the RPC once per line. Lines that do not apply (spouse age and joint offer when not married; `rents_home` when the client owns) get an explicit "Not applicable" action that writes `0`/`false` with a note, never an automatic default. Per-vehicle lists derive the legacy totals as their sums in the same RPC, logged `derived_from: per_vehicle_list`.
- **D-07:** Never propose from absence (PITFALLS M7). A missing employer, no matching transactions or an unsupported statement means no proposal, and the line shows "Needs data". A zero needs staff's "Known $0". Queue job `financials_propose` on `resspark-jobs` recomputes proposals when a payroll or bank connection reaches `done`, the address is confirmed, the client submits intake, staff click Refresh, or staff change the window. A changed value supersedes the old `proposed` row, an unchanged one is kept, and accepted/edited rows are never touched.

### Sources, mappings, evidence (FORM-03, FORM-07)
- **D-08:** Two mapping tables, seeded in the migration.
  - `plaid_category_map(pfc_detailed pk, pfc_primary, taxonomy_version, treatment income|expense|exclude|informational, canonical_column, form_line, reliability, note)` covers every row of Plaid's `pfc-taxonomy-all.csv`, with line assignments from FEATURES §(f). Excluded: `TRANSFER_IN_*`, `TRANSFER_OUT_*`, `LOAN_DISBURSEMENTS_*`, `INCOME_TAX_REFUND`, `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`, payments to the IRS.
  - `truv_deduction_map(truv_category, name_pattern ILIKE, priority, treatment, canonical_column, form_line, reliability, note)`: `federal|state|local|socialsec|medicare` → `actual_current_taxes` (A); `garnishment` → `actual_court_ordered_payments` (B); `benefit` + health/medical/dental/vision → `actual_health_insurance_premiums` (B); `benefit` + life → `actual_life_insurance_premiums` (C; staff confirm term vs whole life); `retirement|other|memo` → informational.
  - No category string appears in TypeScript logic.
- **D-09:** Proposal code lives in `app/worker/src/financials/propose/` (`bank.ts`, `payroll.ts`, `intake.ts`, `logics.ts`, `address.ts`, `run.ts`, each under 500 lines).
  - **Bank:** mapped, non-pending transactions over the last N complete calendar months ÷ N; expenses use outflows (positive Plaid amounts), income uses inflows. N defaults to 3 (Andrew: the standard window) with a 3/6 toggle, recorded in `method` and `window_*`.
  - **Cash:** `cash_and_bank_balances` = sum of depository `balance_current` (A), from new `bank_accounts.balance_current`, `balance_available` and `balance_as_of` columns written by the Phase 4 sync from the `accounts[]` it already receives.
  - **Payroll:** per employer, mean `gross_pay` of stubs in the window × periods per year (52/26/24/12 from `pay_frequency`) ÷ 12, summed per person. Employers default to the taxpayer with a "spouse" toggle. Deductions go through `truv_deduction_map` the same way. Plaid salary deposits are net pay: a cross-check note only, never proposed as wages.
  - **Logics** (`cases.logics_snapshot`): `MaritalStatus` → `filing_status_married`; `DOB` → `age_taxpayer`; `TaxLiability` → `total_tax_owed` (B; blank gives no proposal).
  - Proposals are rounded to cents; the engine never rounds inputs.
- **D-10:** Source badges Truv, Plaid, Intake, Logics, Address, Document, Staff (UI-SPEC palette, outline variant). A confirmed value reads "Confirmed · from Plaid" or "Edited by {staff}". Clicking any figure opens a right Sheet from `GET .../financials/:column/evidence`: bank = transactions by month with monthly subtotals, average and window; payroll = per stub pay date, employer, gross, frequency, plus a signed-URL link to the stub PDF; intake = prompt, answer, answered-at; Logics = field, value, fetched-at; address = USPS address, county, FIPS. No per-transaction exclusion in v1: staff edit the value with a note.

### Standards and county (FORM-05, ADDR-02)
- **D-11:** The migration adds Postgres functions that copy the six queries in `src/standards_repository.py` verbatim (parameterized, reusing `canonical_state_name()`/`normalize_county_name()`), plus `standards_bundle(p_state, p_county, p_household_size, p_vehicle_count)`, which returns one JSON object with exactly the values the engine will request. The Worker calls it once per evaluation. `BundleStandardsRepository` implements the sync interface over it and throws `StandardsLookupError` on null. EXECUTE is revoked from `anon`/`authenticated`.
  - **Finding:** for `vehicle_count = 0`, Python passes area `""`, `PostgresStandardsRepository` finds no operating row and raises, so every vehicle-less household fails on the Python DB path. The tested behavior (the fake returns 0) is the oracle: the bundle returns the seeded zero-vehicle operating amount (0) for the region, with a test. `src/standards_repository.py` stays unchanged.
  - **Live test:** LA County household 1 → 3001; Miami 1 car → 423; national household 6 → 2970; age 65 → 163; 0 vehicles → 0.
  - A one-row `standards_versions` table (effective 2026-06-29, source URL) is shown in the view and printed on the worksheet. A spot check against irs.gov on 2026-10-11 found the seeded amounts match the standards effective June 29, 2026 (national, health, ownership, all 27 operating rows, LA and Alameda housing). No standards data changes in this phase.
- **D-12:** The county comes only from an address.
  - **Confirmed address:** the `address` proposal sets `state_of_residence` (USPS abbreviation) and `county_of_residence` to the IRS table's own county name, found through new `county_fips_map(county_fips pk, state, county, normalized_county)`. The map is generated by `app/scripts/build-county-fips-map.mjs` from the public-domain Census county code list matched to `housing_utilities_standards` names, with unmatched rows listed in seed comments, so an accepted county always hits the standards tables.
  - **FIPS not in the map:** fall back to Smarty `county_name` with a "not in IRS table" warning.
  - **No confirmed address yet:** the Worker verifies the Logics case address through Phase 6's server-side Smarty US Street call and proposes the county with badges Logics + Address.
  - **That fails:** "Needs data — waiting for the client's address", and evaluation is blocked.
  - No county dropdown anywhere; corrections go through the Phase 6 address flow. The planner reads `06-CONTEXT.md` for the stored field names.

### Client intake in the portal (FORM-02)
- **D-13:** The Phase 2 `intake` item becomes a one-question-per-screen step.
  - **Questions:** all 28 except `state_of_residence`/`county_of_residence` (the address step covers them) and the transcript facts `total_tax_owed`, `tax_only_balance`, `csed_months_remaining` (staff enter or accept these).
  - **Order:** `INITIAL_QUESTION_IDS` first, then the applicable follow-ups.
  - **Controls:** yes/no as two 44 px buttons, counts as steppers, pay frequency as four buttons.
  - **Prefill:** only from A-reliability sources (Truv `is_wage_earner`, `pay_frequency`; Logics marital status, age), shown as "We filled this in from your payroll. Tap to change."
  - **Saving:** each screen saves through `PUT /api/c/intake` as `financial_proposals` with source `intake`, so a reload resumes. "Done" marks the item `submitted`. Question wording does not change.

### Staff view and recommendation (FORM-03, FORM-05)
- **D-14:** Route `/admin/cases/$caseId/433a`, a tab on the case page. Bigcapital/ERPNext financial-statement layout as a visual reference only; the default until Nicole and Sandra confirm.
  - **Header:** "{n} of {m} required facts confirmed", the 3/6-month toggle, Refresh proposals.
  - **Sections** (collapsible, form order): Household and residence (S1), Employment per employer (S2), Monthly income (lines 21-35), Monthly expenses (lines 36-51, with Actual | IRS standard | Allowed columns), Assets (S4, one row per vehicle), Compliance (S9), Liability.
  - **Each row:** line number and label; money right-aligned with `tabular-nums` and `Intl.NumberFormat` USD; a chip (Needs data / Proposed / Confirmed / Edited); source badges; Accept / Edit / Known $0 / Unknown. Competing proposals for one line appear side by side.
  - **Sticky right rail:** recommendation card; Box D, E, F; each NRE line (reserve, ×0.8, exemptions, $11,980 deduction); the suggested payment with `ceil(owed ÷ CSED months)` shown; county, household and standards date; Run evaluation; Export worksheet PDF.
  - shadcn Card, Table, Badge, Sheet and Dialog only.
- **D-15:** `POST .../evaluations` runs `evaluateCase` with the bundle and records an immutable row in the baseline `determination_runs`, extended with `firm_id`, `created_by`, `allowable_breakdown`, `nre_lines`, `standards_inputs`, `standards_effective_date`, `engine_version`. The view shows `path` and `reason` verbatim, short labels from `outcome.ts`, and always "A tax professional must review this result before anything is filed." Missing facts show "Information still needed" with the missing labels, and a failed standards lookup shows "Standards unavailable", both as in Python. The engine has no OIC calculation: "OIC" appears only in the existing manual-review text, and no offer amount is invented.

### Worksheet export (FORM-06)
- **D-16:** `POST .../evaluations/:runId/worksheet` renders a Letter PDF with `@cantoo/pdf-lib@2.11.1`, already added in Phase 5 (pdfme rejected: extra dependencies). Code lives in `app/worker/src/worksheet/`, split under 500 lines.
  - **Contents:** that run and confirmed values only, never proposals: firm, client, Logics CaseID, run id and time, standards date, county, every section with its sources, and the recommendation with its math. No SSN, no full account numbers.
  - **Every page:** header "Screening worksheet — Not an IRS form"; footer "Prepared by ResSpark for review by a tax professional. Not an IRS form. Do not file. Page N of M".
  - **Storage:** `.../case/{case_id}/worksheets/{run_id}.pdf` as a `documents` row with `document_type='worksheet_433a'`, `status='ready'`, sha256 and size; event `worksheet.generated`.
  - **Push:** the migration replaces the Phase 5 push-eligibility check (CREATE OR REPLACE) so `worksheet_433a` documents of the same case are eligible without a request item. The worksheet then goes through the existing push card, comment and activity note.

### Document extractors (ROADMAP scope note)
- **D-17:** The final wave ports the regex extractors from `src/document_parse.py`; the OpenRouter fallback stays in Phase 8 (PROD-04). They go into `app/worker/src/extract/`, split by family: `pdf-text.ts` (via `unpdf@1.8.1`, MIT), `classify.ts`, `transcript.ts`, `pay-stub.ts`, `bank-statement.ts`, `housing.ts`, `vehicle.ts`, `accounts.ts`, `business.ts`, `merge.ts`. The oracle is the text fixtures in `src/tests/test_document_parse.py` plus `parse_packet` output for each `examples/` packet, exported by the D-03 script to `golden-extract.json`. Output: `document`-source proposals (B) when staff click "Extract values". This wave gates no FORM requirement; if it slips, it moves to Phase 8.

### Data and routes
- **D-18:** Migration `0008_433a_prepopulation.sql`: the tables from D-05, D-08, D-11 and D-12; the `bank_accounts` and `determination_runs` columns; the standards functions; `financial_value_decide`; the replaced push-eligibility check; RLS on every new table, with grants and function EXECUTE revoked from `anon`/`authenticated`. Seed rows go in `0009_433a_mapping_seed.sql` if 0008 would pass 500 lines. Applied with `app/scripts/db-migrate.mjs`; `app/worker/test/rls.test.ts` adds the new tables.
- **D-19:** Routes. Admin: `GET /api/admin/cases/:id/financials`, `POST .../financials/:column/decide`, `GET .../financials/:column/evidence`, `POST .../financials/refresh {window_months}`, `POST .../evaluations`, `GET .../evaluations/latest`, `POST .../evaluations/:runId/worksheet`. Client: `GET /api/c/intake`, `PUT /api/c/intake`, `POST /api/c/intake/done`. Admin routes use `staffAuth` and the firm-scoped `db/` module; client routes use `clientSession` and the CSRF header and never take a case id from the body. SPA code goes in `features/financials/*` and `features/client-portal/intake/*`.
- **D-20:** No financial value, answer or standard amount is ever logged. No LLM call anywhere in this phase.

### Claude's Discretion
- Column types, index names, RPC return shapes, the `generator_version` scheme, evidence table columns, PDF typography and page breaks, the stepper control, and how `app/shared/` is wired into both tsconfigs.

</decisions>

<specifics>
## Specific Ideas

- Andrew wants the form pre-populated from bank and payroll with IRS standards by county, "and then the rest is yes or no or type in whatever", and staff able to "see the math". On the window: "for standard resolution, it's three months... we'll just do six months". Keep both windows one click apart.
- The 433-A is signed "under the penalty of perjury": every number shows where it came from, and nothing becomes a fact until staff accept it.
- For the researcher to verify:
  - Whether Smarty `county_fips` for Connecticut is the old county code or the planning-region code (the IRS tables use planning regions).
  - Which Plaid PFC version this account gets (v2 default for integrations enabled after 2025-12-03) and the CSV columns.
  - The Truv deduction `category` values in the Phase 4 fixtures.
  - `unpdf` text order vs Python `_page_text` on `examples/`.
  - Whether `/transactions/sync` returns `accounts[].balances` on every page.
- Demo story after Oct 12: Truv `multiple.employments` and Plaid `user_good` connect → proposals appear → bulk accept and "Known $0" → run evaluation → export the worksheet and push it in fake mode.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rules and acceptance
- `CLAUDE.md`, `.claude/CLAUDE.md`: no threshold or formula change without a source and tests; standards in SQL via parameterized queries; NULL vs 0; 500-line limit; a `docs/` companion per code file; TypeScript front end.
- `.planning/PROJECT.md` ("What Andrew asked for", 433-A bullet; Key Decisions on the engine port and licensing). `.planning/Client/call1.md` lines 123-153 (3 vs 6 months, "see the math", county standards, Smarty county).
- `.planning/REQUIREMENTS.md` (FORM-01..07, ADDR-02). `.planning/ROADMAP.md` (Phase 7 success criteria and scope notes).

### Research
- `.planning/research/SUMMARY.md` conflicts 1/1a (the TS port with Python oracle overrides the Python-Worker plan in `ARCHITECTURE.md` §6).
- `.planning/research/STACK.md` §3; `.planning/research/FEATURES.md` §(f) (line-mapping tables); `.planning/research/ARCHITECTURE.md` (`data_suggestions` design, renamed here); `.planning/research/PITFALLS.md` M7, M9, C12.
- `.planning/codebase/CONCERNS.md` (hard-coded constants, CSED edge, vehicle paths, no determination tests); `.planning/codebase/TESTING.md` (`FakeStandardsRepository`, `canonical_zero_row`).

### Oracle (read in full; never edit)
- `src/determination.py`, `src/financial_data.py`, `src/standards.py`, `src/standards_repository.py`, `src/intake_workflow.py`, `src/questions.py`, `src/case_api.py` (`_PATHS`, `_NEXT`, `_outcome`), `src/document_parse.py`, `src/tests/*.py`, `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`, `src/frontend/src/questions.ts`, `src/frontend/src/flow.ts`.

### Prior phases
- `01-CONTEXT.md`: D-01 (`src/frontend` deleted in Phase 7), D-10 (`db-migrate.mjs`), D-12 (RLS), D-13 (28 questions). `01-UI-SPEC.md`: money format, badge palette, tables.
- `02-CONTEXT.md`: D-05 (`logics_snapshot`), D-06 (`intake` item kind). `03-CONTEXT.md`: `documents`, `case-documents` bucket, signed URLs.
- `04-CONTEXT.md` plus interfaces in `04-01-PLAN.md` (`bank_transactions.category_*`, `bank_accounts`) and `04-03-PLAN.md` (Truv report at `connections.data.employers[].report`).
- `05-CONTEXT.md` plus push eligibility in `05-01-PLAN.md`. `06-CONTEXT.md` once written (address fields, Smarty Street module).
- `Logics_API_Documentation.docx.md` line 588 (CaseInfo: `DOB`, `MaritalStatus`, `TaxLiability`, `Address`).

### External sources (verified 2026-10-11)
- IRS standards effective 2026-06-29: https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards, plus `.../national-standards-food-clothing-and-other-items`, `.../national-standards-out-of-pocket-health-care`, `.../local-standards-housing-and-utilities`, `.../local-standards-transportation`.
- IRS forms: https://www.irs.gov/pub/irs-pdf/f433a.pdf (Rev. 6-2026) and `f433aoi.pdf` (Rev. 4-2026).
- Plaid: https://plaid.com/documents/pfc-taxonomy-all.csv and https://plaid.com/docs/transactions/pfc-migration/.
- Smarty US Street `county_fips`/`county_name`: https://www.smarty.com/docs/apis/us-street-api/reference (Autocomplete Pro returns no county).
- Census county FIPS list (public domain): https://www.census.gov/library/reference/code-lists/ansi.html. Connecticut planning regions: Federal Register 2022-12063.

### Repos (GitHub API, 2026-10-11; copy only MIT/Apache)

| Repo | Stars | License | Use |
|---|---|---|---|
| `cantoo-scribe/pdf-lib` (npm `@cantoo/pdf-lib` 2.11.1) | 354 | MIT | worksheet renderer; already a dependency |
| `pdfme/pdfme` (`@pdfme/generator` 6.2.4) | 4,872 | MIT | considered, not used |
| `Hopding/pdf-lib` | 8,654 | MIT | API docs only; last push 2024-07 |
| `actualbudget/actual` | 29,425 | MIT | rule-based category-mapping pattern |
| `benseverndev-oss/goldenmatch` | 132 | MIT | Python emits golden JSON → TS parity test + freshness gate |
| `jup313/irs-financial-calculator` | 1 | MIT | skim only, unvetted |
| `dvankley/firefly-plaid-connector-2` | 148 | GPL-3.0 | PFC mapping, reference only |
| `bigcapitalhq/bigcapital` | 3,931 | AGPL-3.0 | visual reference only |
| `frappe/erpnext` | 39,986 | GPL-3.0 | visual reference only |

GitHub search for "offer in compromise" returns one repo with 0 stars: no open-source 433-A or OIC engine exists. npm also lists `unpdf` 1.8.1 (MIT).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 1:** `logEvent`, firm-scoped `db/`, allowlisted logger, `db-migrate.mjs`, `check-file-sizes.mjs`, the `pnpm check` chain (`app/package.json`).
- **Phase 2:** `clientSession`, step list, the `intake` kind, `cases.logics_snapshot`, the Logics client.
- **Phase 3:** signed-URL helpers, `documents`, the bucket, `StatusBadge`, `pollInterval`.
- **Phase 4:** `bank_transactions` (category columns), `bank_accounts`, Truv `employers[].report`, the queue consumer, `resspark-jobs`.
- **Phase 5:** `@cantoo/pdf-lib`, push card, ledger. **Phase 6:** Smarty Street module and stored address.
- **shadcn-admin:** `data-table`, Sheet, Card, Badge. **Old frontend:** `flow.ts` validation and currency formatter.

### Established Patterns
- Writes go through RPCs that log their event; type guards at API boundaries; NULL means unknown and 0 a known zero, and unknowns block. Named exports, kebab-case, a `docs/` companion per file, 500-line limit, live tests via `test:live`, and the Python suite keeps running.

### Integration Points
- `app/worker/src/index.ts` (routes); the queue dispatcher (`financials_propose`); the end of the Phase 4 reconcile and the Phase 6 address-confirm (enqueue); `app/src/routes/admin/_shell/cases/$caseId/433a.tsx`; the portal step list (`intake`); `pnpm check` (golden freshness); `app/package.json` (`unpdf`, D-17 only).

</code_context>

<deferred>
## Deferred Ideas

- OIC offer amount (RCP = equity + future income ×12/×24): needs an authoritative source, tests and CPA/EA sign-off.
- Moving engine constants into SQL (`irs_form_constants`): a separate change with a source per value.
- Engine behavior changes for a CPA/EA: an explicit reason for `csed_months_remaining <= 0`, compliance gates beyond the current two, and the $220 public-transportation cap (the engine uses the actual amount).
- Conflict flags, per-transaction exclusion, 12-month averaging, recurring streams.
- 433-F and 433-A(OIC) views, filling the official IRS PDFs, signing the worksheet.
- LLM extraction fallback (Phase 8). Retiring the Python engine (after parity is green and the CPA spot-check passes).
- Business sections S6/S7 beyond `net_business_income`; Spanish copy.

</deferred>

## USER ACTION

1. Interview Nicole (head of resolution) and Sandra (case manager) on the D-14 layout. Ask which form they use most (433-A, 433-F, 433-A(OIC)), whether the section order fits, whether the default window should be 3 or 6 months, which bank-derived lines they trust, whether the badge wording is clear, and what the worksheet attached in Logics should look like. Feed the answers back as overrides to D-13, D-14 and D-16.
2. CPA/EA review of the line assignments in `plaid_category_map` and `truv_deduction_map` before any real case.
3. CPA/EA spot-check of three real-shaped cases (TS output vs their own calculation) before results are used on live cases.
4. Andrew: choose the Logics `FileCategoryID` for worksheets if it differs from the Phase 5 default, and approve the disclaimer "Screening worksheet — Not an IRS form".
5. Fix "32 questions" to 28 in `CLAUDE.md` and `.claude/CLAUDE.md` (doc fix only; code and database have 28).

---

*Phase: 07-433-a-pre-population*
*Context gathered: 2026-10-11*
