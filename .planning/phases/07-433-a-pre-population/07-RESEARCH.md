# Phase 7: 433-A Pre-Population - Research

**Researched:** 2026-10-11
**Domain:** Python→TypeScript engine port with golden-fixture parity, a proposals/evidence layer over Plaid and Truv data, Postgres standards RPCs, worksheet PDF on Workers
**Confidence:** HIGH for the port mechanics, the standards data and the schema; MEDIUM for vendor mappings; LOW for Smarty's Connecticut FIPS behavior

## Summary

The port is mechanical, but byte-exact parity needs a few deliberate helpers that D-02 does not mention. The Python oracle runs on **Python 3.11.15** on this machine. There, `sum()` adds floats left to right. Python 3.12+ switched `sum()` to Neumaier compensated summation, so the same fixture exporter would produce different last-bit totals on a newer interpreter. `max`/`min` also differ: Python keeps the first argument on a tie, but JS `Math.max(-0, 0)` returns `+0`, and Vitest `toEqual` treats `-0` and `0` as different. Every value below was probed this session. The fix is to use `pyMax`/`pyMin` helpers, a plain left-to-right sum, and an exporter guard that refuses to run on a compensated-sum Python. Nothing in the engine uses `Decimal`, `round()`, integer division or date math. CSED is an integer input, so the only rounding is `Math.ceil(x * 100) / 100`, which is IEEE-identical in both languages.

Three data findings change the plan:
- **Connecticut standards rows.** Four Connecticut housing rows in the live standards tables have mangled county names: `Planning Region` (row 312) and `Region` (rows 314, 316, 317). Three of them normalize to the same key `region`, so `housing_amount('CT', 'Region', n)` always returns row 314. The amounts match irs.gov (checked this session) but the names do not. Every other IRS county except six spelling variants matches the 2025 Census Gazetteer by name (3,134 of 3,144).
- **Plaid balances.** `/transactions/sync` returns `accounts[]` only for "accounts that have associated transactions" in that response. The D-09 plan to capture balances "from the `accounts[]` it already receives" is unreliable; call `/accounts/get` once per reconcile instead.
- **Phases 2-6 are not executed yet.** Only Phase 1 code and migration `0002` exist. `@cantoo/pdf-lib` is not in `app/package.json` yet (Phase 5 Plan 02 installs it). Phase 7 plans must code against the interfaces in the 02-06 PLAN files, not against existing source.

**Primary recommendation:**
- Build the engine as pure TS in `app/worker/src/engine/` with `py.ts` helpers (`pyMax`, `pyMin`, ordered sum).
- Have the Python exporter record every standards call per case, so the TS parity test asserts identical outputs **and** an identical lookup sequence.
- Fix the four Connecticut names with a cited name-only `UPDATE` (amounts untouched), or exclude those FIPS from the map. User decision, see Open Question 1.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Determination math, workflow status, NRE lines | API / Backend (Worker `engine/`, pure) | — | Deterministic and testable; no I/O (D-01) |
| Golden fixtures | Build tooling (Python stdlib script) | Vitest `worker-node` | Python stays the oracle (D-03) |
| IRS standards lookup | Database (SQL functions + `standards_bundle`) | Worker (`BundleStandardsRepository`) | Standards stay in SQL (CLAUDE.md); engine stays sync (D-11) |
| County resolution | Database (`county_fips_map`) | Worker (Smarty fallback) | FIPS beats names (PITFALLS M9) |
| Proposals (bank/payroll/intake/Logics/address) | API / Backend (queue job `financials_propose`) | Database (mapping tables, aggregate RPC) | Category strings live only in SQL (D-08) |
| Accept/edit → `case_financial_data` | Database (`financial_value_decide`, the only writer) | Worker route | Atomic write + event + proposal status (D-06) |
| 433-A view, intake step | Browser (React SPA) | Worker JSON routes | No logic in the SPA beyond formatting; shares only `app/shared/questions.ts` |
| Worksheet PDF | API / Backend (Worker, `@cantoo/pdf-lib`) | Storage + Phase 5 ledger | Same push path as other documents (D-16) |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Engine port and the Python oracle (FORM-01)**
- **D-01:** The engine runs only in the Worker, in `app/worker/src/engine/`: `financial-data.ts` (every field of `src/financial_data.py`, `REQUIRED_FINANCIAL_COLUMNS`, `financialDataFromCaseRow` throwing `MissingFactError(columns)`), `standards.ts` (`StandardsRepository` with the six sync methods, the facade, `StandardsLookupError`), `determination.ts` (1:1 port), `intake-workflow.ts` (`missingQuestionIds`, `missingFinancialColumns`, `documentRequestsFor`, `evaluateCase`), and `outcome.ts` (the `_PATHS` id/short-label map and the `_NEXT` sentence from `src/case_api.py`). Nothing in `engine/` imports Hono, Supabase, `fetch` or `Date`; a grep check enforces it. The SPA shares only `app/shared/questions.ts` (D-04). — **Reversibility:** costly — routes, worksheet and parity tests import these paths.
- **D-02:** The port is mechanical. Plain `number` (no Decimal, no cents). Same operation order: `Math.ceil((owed / months) * 100) / 100`, the same `max`/`min` nesting, and expense keys in Python dict order so `total` sums in the same order. Every constant stays inline where Python has it (`1000`, `0.8`, `3450`, `11980`, `500`, `50_000`, ages `30`/`65`, CSED clamp `1`), each with a comment citing the Python line and the 433-A(OIC) line. `path` and `reason` strings are byte-identical, because they are the recommendation wording. The `csed_months_remaining <= 0` behavior and the two-condition compliance gate stay exactly as they are. `calculateNetRealizableEquity` returns the sum of `netRealizableEquityLines(fd)` in Python's order, so the view can show each line without a second implementation of the math.
- **D-03:** Golden fixtures come from a new stdlib script, `src/tools/export_golden_fixtures.py` (with companion doc). It imports the unchanged `src/*.py`, builds a fake standards table data-identical to `FakeStandardsRepository` in `src/tests/test_intake_workflow.py`, and writes `app/worker/test/fixtures/engine/golden.json` as `{ standards, questions, cases: [{ name, row, expected }] }`. `expected` holds the workflow status, missing ids and fields, review flags, document request codes, the allowable breakdown, and every `Determination` field. Cases are every determination scenario in the existing 27 tests plus a generated grid of at least 60 rows: both compliance reasons, NRE 500/500.01, owed 50,000/50,000.01, CSED 0/1, per-vehicle list vs legacy totals, the joint-offer second-vehicle exemption, ages 64/65, household 1-6, vehicles 0-3, and one NULL per required column (must give `information_needed`). `engine/parity.test.ts` (project `worker-node`) asserts exact `toEqual`, never `toBeCloseTo`. `pnpm check` gains `python src/tools/export_golden_fixtures.py --check`, which fails on a stale fixture. The 27 Python unittest tests keep running unchanged.
- **D-04:** `app/shared/questions.ts` holds the 28 declarations (ids, prompts, types copied verbatim from `src/questions.py`), the three `_is_applicable` rules, `INITIAL_QUESTION_IDS`, `validateAnswer`, and UI metadata (section, options, help text) from `src/frontend/src/questions.ts`, minus the state and county options. A parity test checks it against `golden.json.questions`; a live test checks it against the 28 `question_definitions` rows. `src/frontend/`, frozen since Phase 1 D-01, is deleted at the end of this phase, including `counties.generated.ts`.

**Proposed versus confirmed (FORM-03, FORM-04)**
- **D-05:** New table `financial_proposals`: `id`, `firm_id`, `case_id`; `canonical_column` (must be a `case_financial_data` column); `proposed_value jsonb`, never JSON null (no data means no row); `source` in truv|plaid|intake|logics|address|document|staff; `source_refs jsonb` array of `{kind, id, label}` with kind in bank_transaction|bank_account|pay_stub|w2|income_report|intake_answer|logics_field|address|document; `method` (e.g. `mean_gross_pay_x_periods_div_12`, `sum_outflows_3mo_div_3`); `window_start`, `window_end`; `reliability` A|B|C; `status` proposed|accepted|edited|rejected|superseded; `decided_value`, `decision_note`, `decided_by`, `decided_at`; `generator_version`, `created_at`. A partial unique index allows one `proposed` row per (`case_id`, `canonical_column`, `source`). Same design research called `data_suggestions`. The baseline `document_extractions` table stays unused and unchanged. — **Reversibility:** one-way — this table is the evidence trail behind every confirmed value; reshaping it later needs a data migration.
- **D-06:** Only one thing writes to `case_financial_data`: RPC `financial_value_decide(p_case_id, p_column, p_action, p_value, p_proposal_id, p_note, p_actor_id)`. Actions: `accept`; `edit` (note required); `known_zero` (writes 0, source `staff`); `unknown` (writes NULL); `reject` (proposal only). In one transaction it creates the row with every column NULL if absent, sets that one column, updates the proposal, and logs `financial.value_<action>`; the logger never logs values. "Accept all proposed in this section" calls the RPC once per line. Lines that do not apply (spouse age and joint offer when not married; `rents_home` when the client owns) get an explicit "Not applicable" action that writes `0`/`false` with a note, never an automatic default. Per-vehicle lists derive the legacy totals as their sums in the same RPC, logged `derived_from: per_vehicle_list`.
- **D-07:** Never propose from absence (PITFALLS M7). A missing employer, no matching transactions or an unsupported statement means no proposal, and the line shows "Needs data". A zero needs staff's "Known $0". Queue job `financials_propose` on `resspark-jobs` recomputes proposals when a payroll or bank connection reaches `done`, the address is confirmed, the client submits intake, staff click Refresh, or staff change the window. A changed value supersedes the old `proposed` row, an unchanged one is kept, and accepted/edited rows are never touched.

**Sources, mappings, evidence (FORM-03, FORM-07)**
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

**Standards and county (FORM-05, ADDR-02)**
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

**Client intake in the portal (FORM-02)**
- **D-13:** The Phase 2 `intake` item becomes a one-question-per-screen step.
  - **Questions:** all 28 except `state_of_residence`/`county_of_residence` (the address step covers them) and the transcript facts `total_tax_owed`, `tax_only_balance`, `csed_months_remaining` (staff enter or accept these).
  - **Order:** `INITIAL_QUESTION_IDS` first, then the applicable follow-ups.
  - **Controls:** yes/no as two 44 px buttons, counts as steppers, pay frequency as four buttons.
  - **Prefill:** only from A-reliability sources (Truv `is_wage_earner`, `pay_frequency`; Logics marital status, age), shown as "We filled this in from your payroll. Tap to change."
  - **Saving:** each screen saves through `PUT /api/c/intake` as `financial_proposals` with source `intake`, so a reload resumes. "Done" marks the item `submitted`. Question wording does not change.

**Staff view and recommendation (FORM-03, FORM-05)**
- **D-14:** Route `/admin/cases/$caseId/433a`, a tab on the case page. Bigcapital/ERPNext financial-statement layout as a visual reference only; the default until Nicole and Sandra confirm.
  - **Header:** "{n} of {m} required facts confirmed", the 3/6-month toggle, Refresh proposals.
  - **Sections** (collapsible, form order): Household and residence (S1), Employment per employer (S2), Monthly income (lines 21-35), Monthly expenses (lines 36-51, with Actual | IRS standard | Allowed columns), Assets (S4, one row per vehicle), Compliance (S9), Liability.
  - **Each row:** line number and label; money right-aligned with `tabular-nums` and `Intl.NumberFormat` USD; a chip (Needs data / Proposed / Confirmed / Edited); source badges; Accept / Edit / Known $0 / Unknown. Competing proposals for one line appear side by side.
  - **Sticky right rail:** recommendation card; Box D, E, F; each NRE line (reserve, ×0.8, exemptions, $11,980 deduction); the suggested payment with `ceil(owed ÷ CSED months)` shown; county, household and standards date; Run evaluation; Export worksheet PDF.
  - shadcn Card, Table, Badge, Sheet and Dialog only.
- **D-15:** `POST .../evaluations` runs `evaluateCase` with the bundle and records an immutable row in the baseline `determination_runs`, extended with `firm_id`, `created_by`, `allowable_breakdown`, `nre_lines`, `standards_inputs`, `standards_effective_date`, `engine_version`. The view shows `path` and `reason` verbatim, short labels from `outcome.ts`, and always "A tax professional must review this result before anything is filed." Missing facts show "Information still needed" with the missing labels, and a failed standards lookup shows "Standards unavailable", both as in Python. The engine has no OIC calculation: "OIC" appears only in the existing manual-review text, and no offer amount is invented.

**Worksheet export (FORM-06)**
- **D-16:** `POST .../evaluations/:runId/worksheet` renders a Letter PDF with `@cantoo/pdf-lib@2.11.1`, already added in Phase 5 (pdfme rejected: extra dependencies). Code lives in `app/worker/src/worksheet/`, split under 500 lines.
  - **Contents:** that run and confirmed values only, never proposals: firm, client, Logics CaseID, run id and time, standards date, county, every section with its sources, and the recommendation with its math. No SSN, no full account numbers.
  - **Every page:** header "Screening worksheet — Not an IRS form"; footer "Prepared by ResSpark for review by a tax professional. Not an IRS form. Do not file. Page N of M".
  - **Storage:** `.../case/{case_id}/worksheets/{run_id}.pdf` as a `documents` row with `document_type='worksheet_433a'`, `status='ready'`, sha256 and size; event `worksheet.generated`.
  - **Push:** the migration replaces the Phase 5 push-eligibility check (CREATE OR REPLACE) so `worksheet_433a` documents of the same case are eligible without a request item. The worksheet then goes through the existing push card, comment and activity note.

**Document extractors (ROADMAP scope note)**
- **D-17:** The final wave ports the regex extractors from `src/document_parse.py`; the OpenRouter fallback stays in Phase 8 (PROD-04). They go into `app/worker/src/extract/`, split by family: `pdf-text.ts` (via `unpdf@1.8.1`, MIT), `classify.ts`, `transcript.ts`, `pay-stub.ts`, `bank-statement.ts`, `housing.ts`, `vehicle.ts`, `accounts.ts`, `business.ts`, `merge.ts`. The oracle is the text fixtures in `src/tests/test_document_parse.py` plus `parse_packet` output for each `examples/` packet, exported by the D-03 script to `golden-extract.json`. Output: `document`-source proposals (B) when staff click "Extract values". This wave gates no FORM requirement; if it slips, it moves to Phase 8.

**Data and routes**
- **D-18:** Migration `0008_433a_prepopulation.sql`: the tables from D-05, D-08, D-11 and D-12; the `bank_accounts` and `determination_runs` columns; the standards functions; `financial_value_decide`; the replaced push-eligibility check; RLS on every new table, with grants and function EXECUTE revoked from `anon`/`authenticated`. Seed rows go in `0009_433a_mapping_seed.sql` if 0008 would pass 500 lines. Applied with `app/scripts/db-migrate.mjs`; `app/worker/test/rls.test.ts` adds the new tables.
- **D-19:** Routes. Admin: `GET /api/admin/cases/:id/financials`, `POST .../financials/:column/decide`, `GET .../financials/:column/evidence`, `POST .../financials/refresh {window_months}`, `POST .../evaluations`, `GET .../evaluations/latest`, `POST .../evaluations/:runId/worksheet`. Client: `GET /api/c/intake`, `PUT /api/c/intake`, `POST /api/c/intake/done`. Admin routes use `staffAuth` and the firm-scoped `db/` module; client routes use `clientSession` and the CSRF header and never take a case id from the body. SPA code goes in `features/financials/*` and `features/client-portal/intake/*`.
- **D-20:** No financial value, answer or standard amount is ever logged. No LLM call anywhere in this phase.

### Claude's Discretion
- Column types, index names, RPC return shapes, the `generator_version` scheme, evidence table columns, PDF typography and page breaks, the stepper control, and how `app/shared/` is wired into both tsconfigs.

### Deferred Ideas (OUT OF SCOPE)
- OIC offer amount (RCP = equity + future income ×12/×24): needs an authoritative source, tests and CPA/EA sign-off.
- Moving engine constants into SQL (`irs_form_constants`): a separate change with a source per value.
- Engine behavior changes for a CPA/EA: an explicit reason for `csed_months_remaining <= 0`, compliance gates beyond the current two, and the $220 public-transportation cap (the engine uses the actual amount).
- Conflict flags, per-transaction exclusion, 12-month averaging, recurring streams.
- 433-F and 433-A(OIC) views, filling the official IRS PDFs, signing the worksheet.
- LLM extraction fallback (Phase 8). Retiring the Python engine (after parity is green and the CPA spot-check passes).
- Business sections S6/S7 beyond `net_business_income`; Spanish copy.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FORM-01 | TS engine, golden fixtures from Python, identical outputs, no constant changed | Port hazards (`sum`, `max`/`min`, `-0`) §Pitfalls 1-3; exporter with recorded standards calls §Pattern 2; Python 3.11.15 probed |
| FORM-02 | Client intake, reconciled against 28 `question_definitions` rows | 28 questions verified (Python + live DB); 23 client-facing after D-13; `pay_frequency`/`has_*` are required columns §Pitfall 7; template gap §Open Q 4 |
| FORM-03 | 433-A view with badges, proposed vs confirmed, drill-down | `financial_proposals` + evidence via SQL aggregate RPC (PostgREST 1,000-row cap) §Pattern 5 |
| FORM-04 | Accept/edit; only accepted values in `case_financial_data`; unknown stays null | `financial_value_decide` with `jsonb_populate_record` typing + cents check §Pattern 4 |
| FORM-05 | County standards + recommendation with math | `standards_bundle` laziness rules; CT name defect; zero-vehicle row exists (`('Northeast', 0, 0)`) §Pattern 3 |
| FORM-06 | Worksheet PDF "Not an IRS form", pushed like any document | pdf-lib two-pass header/footer, WinAnsi limits, Phase 5 `logics_push_create_batch` request coupling §Pattern 6, Open Q 3 |
| FORM-07 | Plaid/Truv mappings in SQL | PFC CSV has 127 v2 detailed rows + 3 v1-only names; Truv categories verified §Mappings |
| ADDR-02 | Stored county feeds the standards lookup | Gazetteer 2025 match 3,134/3,144; 10 exceptions listed; CT FIPS 09110-09190 §County map |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- TypeScript for all front end; Python stays standard-library; no new runtime Python dependencies.
- No IRS threshold, formula, eligibility gate or recommendation wording changes without an authoritative source and targeted tests; cite the source in comments.
- Standards live in SQL and are read through parameterized queries; no IRS amounts in application logic.
- NULL = unknown, 0 = known zero; unknown required values block evaluation.
- No code file over 500 lines; a companion Markdown file in `docs/` (mirroring the path) for every code file; Ponytail (smallest complete change).
- Preserve the question contract (28 in code and DB; the "32" in CLAUDE.md is stale and is a USER ACTION doc fix).
- `unittest` for Python; Vitest for TS; tests must not need a live DB except `test:live`.
- Security: secrets server-side only, RLS on every table, revoke grants, short-lived signed URLs, audit log; no raw documents to an LLM.
- Supabase work loads the `supabase` and `supabase-postgres-best-practices` skills.
- GSD workflow for edits; do not commit from this researcher (orchestrator commits).

## Standard Stack

### Core (no new packages for the gating waves)

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| TypeScript (plain `number`) | 6.0.3 (app) | Engine port | IEEE-754 doubles match CPython floats exactly `[VERIFIED: probes this session]` |
| Vitest | 5.0.3, project `worker-node` | Parity + unit tests | Already configured in `app/vitest.config.ts` `[VERIFIED: file read]` |
| Python | 3.11.15 (`python` on PATH) | Oracle + fixture exporter | Only interpreter present; left-to-right `sum` `[VERIFIED: probe]` |
| `@cantoo/pdf-lib` | 2.11.1 (MIT, published 2026-09-15) | Worksheet PDF | Installed by Phase 5 Plan 02; Context7-indexed `[VERIFIED: npm registry + Context7 /cantoo-scribe/pdf-lib]` |
| Postgres 17 (Supabase `zvkphuikjpwoauqdimcf`) | — | Standards, proposals, decide RPC | Existing project `[VERIFIED: live query]` |

### Supporting (D-17 wave only, non-gating)

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `unpdf` | 1.8.1 (MIT, 2026-08-13) | Text extraction for real-world PDFs | Optional; **not** needed for parity with `_page_text` (see Pitfall 10) `[VERIFIED: npm registry + Context7 /unjs/unpdf]` |

**Installation:** none for the gating waves (`@cantoo/pdf-lib` arrives with Phase 5). D-17 only, if kept: `pnpm -C app add unpdf@1.8.1`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Standard Helvetica (WinAnsi) | Embedded TTF via `@cantoo/fontkit` | Needed only if names contain non-Latin-1 characters; adds a dependency and font bytes |
| `unpdf` for D-17 | Port `_page_text` (~35 lines, `DecompressionStream('deflate')` + ASCII85) | The port gives exact parity on `examples/`; unpdf gives better real-world coverage but different text segmentation |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| `@cantoo/pdf-lib` | npm | created 2021; latest 2026-09-15 | 884,625/wk | github.com/cantoo-scribe/pdf-lib | SUS (`too-new` = latest-release recency only), no postinstall | Keep. Already gated by Phase 5's checkpoint. `[WARNING: flagged as suspicious — verify before using.]` |
| `unpdf` | npm | latest 2026-08-13 | 5,573,749/wk | github.com/unjs/unpdf | OK, no postinstall | Approved (D-17 optional) |

**Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** `@cantoo/pdf-lib` (recency signal only; installed in Phase 5, not here).

## Architecture Patterns

### System Architecture Diagram

```
 Truv report ─┐   Plaid txns + /accounts/get ─┐   Logics snapshot ─┐   Confirmed address (Phase 6) ─┐   Client intake PUT ─┐
              v                                v                    v                                v                     v
        [queue job financials_propose]  <── triggers: connection done | address confirmed | intake done | Refresh | window change
              │  reads plaid_category_map / truv_deduction_map / county_fips_map (SQL)
              │  aggregates via SQL RPC (no 1,000-row PostgREST cap)
              v
        financial_proposals_upsert RPC ── supersede changed, keep unchanged, never touch accepted/edited
              │
   Staff 433-A view (GET financials) ── Accept / Edit / Known $0 / Unknown / N/A
              v
        financial_value_decide RPC ──> case_financial_data (only writer) + event financial.value_<action>
              │
   POST evaluations: read row ─> standards_bundle(state, county, hh, vehicles) ─> BundleStandardsRepository
              │                                                                       │
              └──────────────> engine.evaluateCase (pure TS) <─────────────────────────┘
                                     │
                  determination_runs (immutable, full JSON result)
                                     │
   POST worksheet ─> pdf-lib render ─> Storage firm/{f}/case/{c}/worksheets/{run}.pdf ─> documents(worksheet_433a)
                                     │
                     Phase 5 push card ─> logics_push_create_batch (replaced eligibility) ─> Logics
```

### Recommended Project Structure

```
app/shared/questions.ts                 # D-04, imported by SPA and Worker (add to both tsconfig includes)
app/worker/src/engine/
  py.ts                                 # pyMax, pyMin, sumInOrder (Python semantics), MissingFactError
  financial-data.ts  standards.ts  determination.ts  intake-workflow.ts  outcome.ts
  parity.test.ts                        # reads test/fixtures/engine/golden.json
app/worker/src/standards/bundle-repository.ts   # BundleStandardsRepository over standards_bundle
app/worker/src/financials/{routes,db,propose/*,evidence}.ts
app/worker/src/worksheet/{render,layout,sections,text}.ts
src/tools/export_golden_fixtures.py     # + docs/src/tools/export_golden_fixtures.md
app/scripts/build-county-fips-map.mjs   # emits supabase/migrations/0009_*.sql (generated, marked so)
```

### Pattern 1: Python-semantics helpers (required for exact parity)

**What:** Python `max`/`min` return the **first** argument on ties. JS `Math.max(-0, 0)` returns `+0`. Probe output this session: Python `max(-0.0,0)` → `-0.0`; Node `Object.is(Math.max(-0,0),0)` → `true`; Vitest `expect(-0).toEqual(0)` → **NOT equal**. Python 3.11 `sum()` is plain left-to-right (`sum([0.1]*10)` → `0.9999999999999999`). Python ≥3.12 uses Neumaier summation `[CITED: docs.python.org/3/whatsnew/3.12.html, gh-100425]`.

```ts
// app/worker/src/engine/py.ts — Python builtins semantics (src/determination.py uses max/min/sum)
export const pyMax = (a: number, b: number): number => (b > a ? b : a) // max(a, b): first wins on tie
export const pyMin = (a: number, b: number): number => (b < a ? b : a) // min(a, b): first wins on tie
export const sumInOrder = (values: readonly number[]): number => {
  let total = 0 // Python 3.11 sum(): start=0, left to right; the exporter refuses a 3.12+ interpreter
  for (const value of values) total += value
  return total
}
```

### Pattern 2: Golden exporter that records standards calls

**What:** wrap the fake repository in a recorder. Each case stores the exact `(method, args, value)` sequence Python made. The TS fake replays it and **throws on any call that is not next in the sequence**. This proves the outputs and also the laziness. Python calls `transportation_area` only `if fd.vehicle_count` (src/determination.py:43-46) and calls `health_care_standard` with `30` and `65` every time (lines 61-64). Import `FakeStandardsRepository` and `canonical_zero_row` from `src/tests/test_intake_workflow.py:25,52`; do not copy them, so the data cannot drift.

```python
# src/tools/export_golden_fixtures.py (sketch; stdlib only)
import json, sys
from pathlib import Path
SRC = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(SRC), str(SRC / "tests")]
from intake_workflow import evaluate_case, calculate_allowable_expenses  # noqa (expenses via determination)
from test_intake_workflow import FakeStandardsRepository, canonical_zero_row

if sum([0.1] * 10) == 1.0:  # 3.12+ Neumaier sum would change last-bit totals
    sys.exit("Golden fixtures need left-to-right float sum (Python <= 3.11); the TS engine mirrors that.")

class Recorder:
    def __init__(self, inner): self.inner, self.calls = inner, []
    def __getattr__(self, name):
        fn = getattr(self.inner, name)
        def call(*args):
            value = fn(*args); self.calls.append({"method": name, "args": list(args), "value": value}); return value
        return call
OUT = SRC.parent / "app/worker/test/fixtures/engine/golden.json"
# build cases → payload; --check: compare json.loads(OUT) == payload (parsed compare survives CRLF checkouts)
```

**Expected shape (recommended):** `{ python: "3.11.15", questions: [...], cases: [{ name, row, expected: { status, missing_question_ids, missing_financial_fields, review_flags, document_request_codes, allowable_breakdown|null, nre_lines|null, determination|null }, standards_calls: [...] }] }`.

`allowable_breakdown` comes from `calculate_allowable_expenses` and `nre_lines` from the individual `max(...)` terms. Both are computed only when the status is not `information_needed`, using a second Recorder so the main call sequence is not polluted. `nre_lines` has no Python function, so the exporter recomputes the seven terms with expressions copied from src/determination.py:92-113 and asserts that their sum equals `calculate_net_realizable_equity(fd)`. Rows must not contain `-0.0` or `float` values in `int` columns (assert this in the exporter).

**Run from `pnpm check`:** cwd is `app/`, so the command is `python ../src/tools/export_golden_fixtures.py --check`. The script resolves paths from `__file__`.

### Pattern 3: `standards_bundle` mirrors Python's laziness, nulls instead of raising

Return `jsonb_build_object` with keys `national`, `health_under_65`, `health_65_plus`, `transportation_area`, `ownership`, `operating`, `housing`. Each key is null when its lookup has no row. `transportation_area` is computed only when `p_vehicle_count <> 0`. For 0 vehicles, return `operating` from the seeded zero-vehicle row of any area. Every area has `vehicle_count 0 → 0` (seed: `('Northeast', 0, 0)`, `('Boston', 0, 0)`, … in `src/schemas/lookup_standards.seed.sql:16516-16519`). The live DB has **no** area `''` row (`empty_area_rows: 0`, live query), which confirms the D-11 finding.

`BundleStandardsRepository` asserts that each call's args equal the bundle's inputs (`household_size`, `vehicle_count`, ages `30`/`65`, and area `""` only when vehicles = 0). It throws `StandardsLookupError` on a mismatch or a null. The live functions are already schema-qualified with `SET search_path TO ''` (live `pg_get_functiondef`; the repo `.sql` file is older), so new functions can call `public.canonical_state_name(...)` safely.

### Pattern 4: `financial_value_decide` typing without hand-written casts

```sql
-- inside plpgsql, SECURITY INVOKER, SET search_path = ''
-- 1) column whitelist: exists in case_financial_data and not in (case_id, updated_at, ai_flags)
-- 2) type gate: jsonb_typeof(p_value) must match the column (boolean|number|string|array) or be absent for 'unknown'
-- 3) numeric(14,2) columns: reject p_value::text::numeric <> round(p_value::text::numeric, 2)  -- else silent rounding
v_rec := jsonb_populate_record(NULL::public.case_financial_data, jsonb_build_object(p_column, p_value));
INSERT INTO public.case_financial_data (case_id) VALUES (p_case_id) ON CONFLICT (case_id) DO NOTHING;
EXECUTE format('UPDATE public.case_financial_data SET %I = ($1).%I, updated_at = now() WHERE case_id = $2', p_column, p_column)
  USING v_rec, p_case_id;
```

CHECK constraints (`household_size >= 1`, `vehicle_count >= 0`, `csed_months_remaining >= 0`, arrays are `jsonb` arrays) already guard ranges `[VERIFIED: src/schemas/database_schema.sql:151-158]`. Lock the case (`SELECT … FROM public.cases WHERE id = p_case_id AND firm_id = p_firm_id FOR UPDATE`). On `accept`, require that the proposal's `status = 'proposed'`, else raise `proposal_stale`. Per-vehicle arrays need every element to be a non-null number ≥ 0, because Python would raise on `None * 0.8`.

### Pattern 5: Bank aggregation in SQL, not in TS

PostgREST caps responses (Supabase default 1,000 rows) `[ASSUMED]`. Six months of transactions can exceed that. Add an RPC that joins `bank_transactions` to `plaid_category_map` and returns per-(column, month) sums plus counts for the window. This also keeps every category string out of TS (D-08). Evidence drill-down pages through transaction ids with `.range()`.

### Pattern 6: Worksheet header/footer on every page (two passes)

```ts
// Source: Context7 /cantoo-scribe/pdf-lib README (drawText, StandardFonts, widthOfTextAtSize)
const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.Helvetica)
// pass 1: lay out sections with a y-cursor; when y < BOTTOM + rowHeight -> doc.addPage(PageSizes.Letter)
// pass 2: const pages = doc.getPages(); pages.forEach((p, i) => { drawHeader(p); drawFooter(p, `Page ${i + 1} of ${pages.length}`) })
const bytes = await doc.save()
```

Standard fonts use WinAnsi (Windows-1252) and **throw** on characters outside it `[CITED: Context7 cantoo README "Fonts and Unicode"]`. The fixed copy ("—", "·", "×", "÷") is in Windows-1252. Client names and employer names may not be, so run every dynamic string through a sanitizer that replaces characters it cannot encode with "?".

### Anti-Patterns to Avoid

- **`Math.max`/`Math.min` or `reduce` with a non-zero seed in `engine/`:** they break `-0` and sum-order parity. Use `py.ts`.
- **`toBeCloseTo` in parity tests:** it hides drift (D-03).
- **Reading `bank_transactions` rows into TS to sum:** the row cap truncates silently, and category strings leak into code.
- **Category or deduction strings in TS `if`s:** D-08 forbids them; add a grep check like the D-01 one.
- **Storing only `numeric(14,2)` run columns:** `determination_runs` money columns round to cents. Also store the full engine result `jsonb` so the worksheet re-renders the exact run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| JSON → typed column write | per-column CASE/cast code | `jsonb_populate_record(NULL::case_financial_data, …)` + `format('%I')` | Postgres does the type coercion and the CHECKs |
| Standards fake in TS | re-implementing `FakeStandardsRepository` math | recorded `standards_calls` replay | Zero drift, and it proves the lookup sequence |
| County names | fuzzy matching | `county_fips_map` keyed by FIPS from the Census Gazetteer | 3,134/3,144 match exactly; 10 explicit overrides |
| PDF layout engine | HTML→PDF | pdf-lib `drawText` + cursor | Few pages, no deps |
| Money rounding of proposals | float `toFixed` | integer cents + half-up division (Code Examples) | `toFixed` is binary-float rounding |

## Common Pitfalls

1. **Interpreter-dependent `sum`.** Python 3.12+ fixtures differ in the last bit from 3.11 fixtures for cents values. *Avoid:* the exporter guard (Pattern 2) and `sumInOrder`. *Warning sign:* `--check` fails after a Python upgrade with no code change.
2. **`-0` vs `0`.** Vitest `toEqual` distinguishes them (probed). *Avoid:* `pyMax`/`pyMin`; reject `-0.0` in fixture inputs.
3. **Python truthiness and `is None`.** Port `x is None` as `x == null` (covers `undefined`), `is True`/`is False` as `=== true`/`=== false`, `case_row.get("is_wage_earner")` as truthiness, `dict.fromkeys(codes)` as `[...new Set(codes)]`, and `sorted()` as default `.sort()` (ASCII ids; never `localeCompare`). `validate_answer` rejects `3.0` for `int` in Python, but JSON cannot carry that difference, so keep such inputs out of the fixtures.
4. **Connecticut standards names (live defect).** Rows 312/314/316/317 are named `Planning Region`/`Region`/`Region`/`Region` in the live DB. IRS names: Lower Connecticut River Valley (2,388), Northeastern Connecticut (2,026), South Central Connecticut (2,359), Southeastern Connecticut (2,157); the amounts match `[VERIFIED: live query + irs.gov CT page]`. Without a fix, South Central and Southeastern clients silently get Northeastern's standard. *Avoid:* Open Question 1.
5. **Smarty Connecticut FIPS ambiguity.** Census adopted nine planning regions (09110-09190), but Smarty may still return the old county FIPS (09001-09015), which do not map 1:1 to regions `[ASSUMED]`. *Avoid:* map only 0911x-0919x. An old CT code → no map hit → "Needs data", with a note naming the cause; never fall back to the Smarty `county_name` for CT (it would match nothing, or the wrong row).
6. **Stale proposals.** A recompute that no longer produces a column leaves the old `proposed` row standing. *Avoid:* scope supersede per (case, source, run): rows of that source not regenerated in the run become `superseded`. Lock per case (`FOR UPDATE` on `cases` or `pg_advisory_xact_lock`) so the job and Refresh cannot race into a 23505 on the partial unique index.
7. **Required columns nobody answers.** `missing_question_ids` requires `pay_frequency` and the four `has_*` flags for every case. Only `filing_joint_offer`/`age_spouse` (when not married) and `rents_home` (when owning) are exempt `[VERIFIED: src/intake_workflow.py:76-81,101-107]`. A non-wage-earner still needs a `pay_frequency` value. See Open Question 2.
8. **Plaid balances and history readiness.** `/transactions/sync` `accounts[]` lists "Only accounts that have associated transactions" `[CITED: plaid.com/docs/api/products/transactions]`. Use `/accounts/get` for `balance_current`. Do not propose bank averages until `transactions_update_status = HISTORICAL_UPDATE_COMPLETE` and the earliest transaction per account is on or before `window_start`; otherwise a partial month reads as a low average (M7).
9. **Truv shapes.** Amounts are strings (`"2650.00"`). `pay_frequency` codes are `M, SM, W, BW, A, SA, C` `[CITED: docs.truv.com income-employment]`. D-09 covers 52/26/24/12 only, so `A`/`SA`/`C` → no wage proposal. Intake prefill maps `W→weekly, BW→biweekly, SM→semimonthly, M→monthly`, else no prefill.
10. **D-17 text order.** Python `_page_text` returns raw `Tj` strings in stream order plus a `Tm`-keyed `rows` map (src/document_parse.py:842-864). unpdf (pdf.js) re-segments text items, so regex extractors written against `texts` will not see the same list. For parity, port `_page_text` itself.
11. **Worksheet idempotency.** pdf-lib output bytes vary (dates/IDs), so the Phase 5 fingerprint `sha256(case|sha|0)` changes per render. Key the document by `storage_key = …/worksheets/{run_id}.pdf` (UNIQUE) and return the existing row on re-export.
12. **`determination_runs` constraints.** `id UUID PRIMARY KEY` has no default and `status` allows only 4 values `[VERIFIED: database_schema.sql:281-296; live columns]`. Insert `gen_random_uuid()` (or add a default in 0008). Do not persist "Standards unavailable" runs, or widen the CHECK deliberately.

## Code Examples

### Allowable expenses, line by line (src/determination.py:41-72)

```ts
// Verbatim source: persons_65_or_older = sum(1 for age in (fd.age_taxpayer, fd.age_spouse) if age >= 65)
const persons65 = (fd.ageTaxpayer >= 65 ? 1 : 0) + (fd.ageSpouse >= 65 ? 1 : 0)
const personsUnder65 = fd.householdSize - persons65            // may go negative; port as is
const area = fd.vehicleCount ? s.transportationArea(fd.stateOfResidence, fd.countyOfResidence) : ""
const allowed = {                                              // key order == Python dict order (total sums in this order)
  food_clothing_misc: s.nationalAmount(fd.householdSize),
  housing_utilities: pyMin(fd.actualHousingUtilities, s.housingAmount(fd.stateOfResidence, fd.countyOfResidence, fd.householdSize)),
  vehicle_ownership: pyMin(fd.actualVehicleLoanLease, s.transportationOwnershipAmount(fd.vehicleCount)),
  vehicle_operating: pyMin(fd.actualVehicleOperating, s.transportationOperatingAmount(area, fd.vehicleCount)),
  public_transportation: fd.vehicleCount === 0 ? fd.actualPublicTransportation : 0,
  health_insurance_premiums: fd.actualHealthInsurancePremiums,
  out_of_pocket_health_care: personsUnder65 * s.healthCareAmount(30) + persons65 * s.healthCareAmount(65),
  // …court_ordered, child_dependent_care, life_insurance, current_taxes, delinquent_state_local_tax, secured_debts_other
}
const total = sumInOrder(Object.values(allowed))
```

The evaluation order of the standards calls matters for the recorded-call replay. Python evaluates `housing_standard` inside `min(...)` before `transportation_ownership_standard`, matching the dict literal order. The JS object literal evaluates in the same order.

### Verbatim strings that must stay byte-identical

- src/determination.py:161 `path="BLOCKED — Compliance gate failed"`, :174 `"Currently Not Collectible (CNC / Status 53)"`, :184 `"MANUAL REVIEW — negative income, meaningful equity present"`, :204 `"Simple Payment Plan"`, :214 `"Non-Simple Installment Agreement"`, :222 `"MANUAL REVIEW — payment resolution needs review"`.
- src/case_api.py:28 `_NEXT = "A tax professional must review this result before anything is filed."`, plus `_PATHS` at :33-40 (ids `blocked`, `cnc`, `manual_equity`, `simple_plan`, `non_simple_installment`, `manual_payment`).

Generate `outcome.ts` from these quotes, and have the exporter emit `_PATHS` and `_NEXT` into `golden.json` so a test compares them.

### Proposal cents (half-up, integer math)

```ts
// Proposals only (D-09); never used inside engine/. Mirrors document_parse._to_monthly ROUND_HALF_UP.
export const toCents = (s: string): number => { const [w, f = ""] = s.replace(/[$,]/g, "").split("."); const sign = w.startsWith("-") ? -1 : 1
  return sign * (Math.abs(Number(w)) * 100 + Number((f + "00").slice(0, 2))) }
export const divHalfUp = (num: number, den: number): number => Math.sign(num) * Math.floor((2 * Math.abs(num) + den) / (2 * den))
// monthly wage cents = divHalfUp(sumGrossCents * periodsPerYear, stubCount * 12)
```

`toCents` assumes at most 2 decimals; assert this. Values stay below 2^53.

## Mappings (FORM-07)

- **Plaid PFC CSV** (downloaded this session) has columns `PFCv2 Primary, PFCv2 Detailed, PFCv2 Description, PFCv1 Primary, PFCv1 Detailed, PFCv1 Description`. Row 2 is a free-text note row, so skip it.
- The CSV has **127 v2 detailed rows** across 18 primaries, 22 of them v2-only. Three v1-only names must also be keyed: `INCOME_WAGES`, `INCOME_OTHER_INCOME`, `TRANSFER_IN_CASH_ADVANCES_AND_LOANS`. That makes **130 map rows**.
- `OTHER_OTHER` → informational.
- Tax payments cannot be told apart by recipient. `GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT` should be `informational` (staff decide whether it is a state delinquency or an IRS payment), not auto-mapped.
- **PFC version:** new customers enabled after 2025-12-03 get v2 by default; earlier ones get v1 unless the request sets `options.personal_finance_category_version: "v2"` `[CITED: plaid.com/docs/transactions/pfc-migration]`. The Phase 4 plans do not set it `[VERIFIED: grep]`. Add it to the Phase 4 sync call, a one-line change that makes the version explicit.
- **Truv deduction categories:** `memo, medicare, retirement, benefit, socialsec, federal, state, garnishment, local, other` `[CITED: docs.truv.com/api-reference/account-link-income-and-employment-reports/object]`. This matches D-08 exactly.

## County Map (ADDR-02)

- **Source:** the 2025 Census Gazetteer `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_counties_national.zip` (pipe-delimited `USPS|GEOID|…|NAME`; 3,222 rows; includes CT 09110-09190).
  - Do **not** use `codes2020/national_county2020.txt`: it still lists the 8 old CT counties (`H4|N`).
- **Name matching:** normalized with the same suffix rules (`' city and borough',' census area',' municipio',' parish',' borough',' county'`), 3,134 of 3,144 Gazetteer counties in IRS states match. The builder needs these explicit overrides:

| FIPS | Census name | IRS row text |
|---|---|---|
| 02063 / 02066 | Chugach / Copper River Census Area | `Chugach Census Area, Alaska` / `Copper River Census Area, Alaska` |
| 17099 / 22059 | LaSalle County / LaSalle Parish | `La Salle County` / `La Salle Parish` |
| 35011 / 35013 | De Baca County / Doña Ana County | `DeBaca County` / `Dona Ana County` |
| 09130, 09150, 09170, 09180 | CT planning regions | mangled (`Planning Region`, `Region`×3), see Open Question 1 |

- Virginia `Bedford city` (merged in 2013) has no FIPS; list it in the seed comments.
- Puerto Rico has no `pr` row in `state_aliases`, so either skip PR or add the alias in the map only.
- The ~3,150 seed rows go in a separate generated file (`0009_county_fips_seed.sql`, header "generated by app/scripts/build-county-fips-map.mjs, do not edit"), like `lookup_standards.seed.sql`.

## Runtime / Integration Inventory (contracts this phase edits)

| Item | Found | Action |
|---|---|---|
| Phase 5 eligibility | Inside `logics_push_create_batch(p_request_id …)`: requires `request_items.request_id = p_request_id AND status='approved'`; TS `listPushableDocuments` joins documents→request_items→requests | `CREATE OR REPLACE` with an OR branch (`document_type='worksheet_433a' AND request_item_id IS NULL AND case_id = r.case_id AND status='ready'`) **and** change the TS list to a LEFT JOIN. The push route is per request, so a worksheet needs a request context (Open Question 3) |
| Phase 2 templates | "Standard resolution packet" seeds 5 items with **no `intake`** item; staff cannot add kinds | 0008 updates the template seeds (or the builder gains an intake toggle) |
| Phase 6 columns | `cases.state_code, county_name, county_fips, address_verified, address_source, address_confirmed_at` (06-CONTEXT D-02) | Matches 07-CONTEXT D-12. Gap: a **manual** address has county NULL; D-12 handles only "no confirmed address". Treat manual = unconfirmed for the county (run Smarty on it as for Logics) |
| Live standards functions | Qualified, `search_path ''` (repo `.sql` is stale) | None; note it in the migration doc |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| CT 8 counties | 9 planning regions (FIPS 091x0) | Census 2022; IRS housing tables since 2024 | Map by region FIPS only |
| Plaid PFCv1 | PFCv2 (127 detailed) | Dec 2025 | Seed both names; request v2 explicitly |
| Python `sum` naive | Neumaier | Python 3.12 | Exporter guard |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Smarty US Street returns old CT county FIPS (09001-09015) for some or all addresses | Pitfall 5 | CT clients block on "Needs data"; if it returns region FIPS, they map directly (better) |
| A2 | PostgREST/Supabase caps rows at 1,000 by default | Pattern 5 | Low; the SQL aggregate is right either way |
| A3 | PostgREST returns `numeric` as JSON numbers, not strings | engine inputs | A string `"2280.00"` would break arithmetic; the live test catches it (the CLI returned strings, but that is the Management API) |
| A4 | `/accounts/get` is not billed per call (unlike `/accounts/balance/get`) | Pitfall 8 | Small extra cost |
| A5 | This Plaid account was enabled after 2025-12-03 (v2 default) | Mappings | v1 names would arrive; the 3 v1-only rows cover them |
| A6 | Logics `MaritalStatus` values (e.g. "Married") and a `TaxLiability` money format | D-09 Logics | Unparsed values give no proposal (safe) |
| A7 | `DecompressionStream('deflate')` (zlib) exists on Workers and Node 22+ | Pitfall 10 | Only D-17 |

## Open Questions

1. **Connecticut row names (UNRESOLVED, user decision).** (a) A name-only `UPDATE housing_utilities_standards SET county=…, normalized_county=… WHERE state='Connecticut' AND source_row IN (312,314,316,317)` in 0009, citing the IRS CT page, with a test that each region FIPS resolves to its own amount. Amounts are unchanged. This contradicts D-11's "No standards data changes" only in names. Or (b) leave the data, map only 09110/09120/09140/09160/09190 plus 09130→`Planning Region` (unique), and let 09150/09170/09180 block as "not in IRS table". Recommendation: (a).
2. **`pay_frequency` for non-wage earners (UNRESOLVED).** Python requires a non-null string. Recommendation: the "Not applicable" action writes `'not_applicable'` for this text column with a note (`validate_answer` checks only `str`). The engine never reads it.
3. **Worksheet push context (UNRESOLVED).** The Phase 5 push route and batch RPC are keyed by `request_id`. Recommendation: the worksheet push uses the case's most recent non-revoked request as `p_request_id`; the replaced RPC accepts `worksheet_433a` documents whose `case_id` matches that request's case.
4. **Intake item in templates (RESOLVED → plan task).** Add `{kind:'intake', label:'Answer a few questions', required:true}` to the seeded templates in 0008.
5. **Smarty CT behavior (UNRESOLVED until Phase 6 keys exist).** Wave 0 task: one live US Street call for a Hartford address, logging only `county_fips` and `county_name`.
6. **Python version policy (RESOLVED).** The TS port uses left-to-right sum; the exporter refuses Python ≥3.12 semantics with a clear message. Switching later means swapping `sumInOrder` for Neumaier and regenerating fixtures.
7. **D-17 text layer (RESOLVED as recommendation).** Port `_page_text` for parity; defer unpdf to Phase 8 with the LLM fallback.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Python | exporter, `--check`, 27 unittests (all pass) | ✓ | 3.11.15 | — |
| Node / pnpm | app, Worker, Vitest | ✓ | 24.14.0 / 10.32.1 | — |
| Supabase project (Management API via CLI) | migrations, live tests | ✓ | PG 17 | — |
| Phases 2-6 code (`clientSession`, `connections`, Phase 5 push, Smarty client) | routes, proposals, push | ✗ (planned only) | — | Code against PLAN interfaces; Phase 7 waves gate on their migrations (0003-0007) being applied |
| Smarty / Plaid / Truv credentials | live proposal tests | unknown (not readable) | — | Recorded fixtures; live tests env-gated |

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 5.0.3 (`web` jsdom, `worker-node`, `workerd`) + Python `unittest` |
| Config file | `app/vitest.config.ts`, `app/worker/vitest.config.ts` |
| Quick run command | `pnpm -C app exec vitest run --project worker-node worker/src/engine` |
| Full suite command | `pnpm -C app check && pnpm -C app test:live && python -m unittest discover -s src/tests -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| FORM-01 | TS output `toEqual` Python for every golden case + identical standards call sequence | unit | `vitest run --project worker-node worker/src/engine/parity.test.ts` | ❌ Wave 0 |
| FORM-01 | Fixture fresh | gate | `python ../src/tools/export_golden_fixtures.py --check` (in `pnpm check`) | ❌ Wave 0 |
| FORM-01 | `engine/` imports nothing impure | grep gate | `! grep -rE "from 'hono'|supabase|fetch\(|new Date|Date\.now" app/worker/src/engine --include=*.ts --exclude=*.test.ts` | ❌ |
| FORM-02 | `app/shared/questions.ts` == golden questions; == 28 live `question_definitions` rows | unit + live | `vitest run worker/test/questions-parity.test.ts`; `test:live` | ❌ |
| FORM-02 | Intake screens: order, applicability, resume, save | web | `vitest run --project web src/features/client-portal/intake` | ❌ |
| FORM-03 | Proposals: bank avg (3/6), payroll ×periods÷12, PFC/Truv mapping, never from absence | unit (recorded Plaid/Truv fixtures) | `vitest run worker/src/financials/propose` | ❌ |
| FORM-04 | Decide RPC: accept/edit(note)/known_zero/unknown/reject/N/A; type + cents gate; stale proposal; event logged without values | live | `test:live worker/test/financials-decide.test.ts` | ❌ |
| FORM-05 | Bundle: LA hh1 3001; Miami 1 car 423; national hh6 2970; age 65 163; 0 vehicles 0; CT regions distinct | live | `test:live worker/test/standards-bundle.test.ts` | ❌ |
| FORM-06 | Worksheet: header/footer on every page, "Page N of M", no proposals, sanitizer, idempotent re-export, eligible in push | worker-node + live | `vitest run worker/src/worksheet`; `test:live worker/test/worksheet.test.ts` | ❌ |
| FORM-07 | 130 PFC rows; every CSV row present; no category literals in TS | live + grep | `test:live`; `! grep -rE "INCOME_|TRANSFER_|socialsec|garnishment" app/worker/src --include=*.ts --exclude-dir=test` | ❌ |
| ADDR-02 | FIPS→IRS county hits housing for every map row; unmatched list matches the 10 known | live | `test:live worker/test/county-map.test.ts` | ❌ |
| UI | 433-A view chips, badges, evidence Sheet, rail math display | web | `vitest run --project web src/features/financials` | ❌ |

### Sampling Rate

- **Per task commit:** the quick engine run plus the touched folder's tests.
- **Per wave merge:** `pnpm -C app check` (includes the fixture freshness check).
- **Phase gate:** full suite + `test:live` + `test:rls` green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/tools/export_golden_fixtures.py` + `app/worker/test/fixtures/engine/golden.json` + `docs/` companion
- [ ] `app/worker/src/engine/parity.test.ts` and the recorded-call fake
- [ ] `pnpm check` step for `--check`; grep gates (engine purity, category literals)
- [ ] `app/worker/test/rls.test.ts`: add `financial_proposals`, `plaid_category_map`, `truv_deduction_map`, `county_fips_map`, `standards_versions`
- [ ] Recorded Truv income report (two employers, string amounts, `BW`/`SM`) and Plaid sync page fixtures

## Security Domain

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | `staffAuth` (jose JWT) for admin; `clientSession` cookie + CSRF header for client |
| V3 Session Management | yes | Phase 2 HttpOnly cookie; client routes never take a case id from the body |
| V4 Access Control | yes | Firm-scoped `db/`; every RPC checks `cases.firm_id = p_firm_id`; RLS on, grants and EXECUTE revoked |
| V5 Input Validation | yes | Route type guards; RPC column whitelist + `jsonb_typeof` + cents check; `validateAnswer` |
| V6 Cryptography | no new | sha256 via WebCrypto for documents |
| V7 Logging | yes | Allowlisted logger; events carry column names and actions, never values (D-20) |

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Client writes another case's intake | Spoofing / Elevation | Case id from the session only; RPC re-checks the link → case |
| Arbitrary column write via `p_column` | Tampering | Whitelist from `information_schema`; `format('%I')` |
| Financial values in logs or events | Info disclosure | Logger allowlist; event payload `{column, action, proposal_id, source}` only |
| Worksheet leaks SSN or account numbers | Info disclosure | Render only confirmed `case_financial_data` + masks; no SSN field exists |
| Formula injection via names in the PDF | Tampering | Plain text draw; WinAnsi sanitizer |

## Sources

### Primary (HIGH)
- Repo files read this session: `src/determination.py`, `src/financial_data.py`, `src/standards.py`, `src/standards_repository.py`, `src/intake_workflow.py`, `src/questions.py`, `src/case_api.py`, `src/tests/test_intake_workflow.py`, `src/tests/test_case_api.py`, `src/schemas/database_schema.sql`, `lookup_standards.seed.sql` (CT, seeds), `supabase/migrations/0002_platform_foundation.sql`, `app/scripts/db-migrate.mjs`, `app/vitest.config.ts`, the tsconfigs, the 02/03/04/05/06 CONTEXT and PLAN excerpts
- Live Supabase queries: CT rows, empty-area count 0, LA hh1 3001.00, function defs, table columns
- Probes: Python 3.11.15 `sum`/`max`; Node `Math.max(-0,0)`; Vitest `toEqual(-0,0)`; 27 Python tests OK
- Plaid `pfc-taxonomy-all.csv` (downloaded); Census Gazetteer 2025 and `national_county2020.txt` (downloaded)
- Context7 `/cantoo-scribe/pdf-lib`, `/unjs/unpdf`; npm registry + legitimacy seam

### Secondary (MEDIUM)
- irs.gov Connecticut housing page (via search excerpt); plaid.com/docs/api/products/transactions and /transactions/pfc-migration; docs.truv.com report object and income-employment pages; docs.python.org What's New 3.12

### Tertiary (LOW)
- Smarty county FIPS article (silent on CT)

## Metadata

**Confidence breakdown:**
- Port mechanics: HIGH (probed in both runtimes)
- Standards and county: HIGH (live data + Census file) except Smarty CT (LOW)
- Mappings: MEDIUM (vendor docs; line assignments need CPA/EA review per USER ACTION 2)
- Worksheet: MEDIUM (library docs; no Workers benchmark)

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 (Plaid/Truv docs move; IRS standards change each spring)
