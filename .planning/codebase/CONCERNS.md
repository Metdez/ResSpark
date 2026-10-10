---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# Codebase Concerns

**Analysis Date:** 2026-10-10

## Tech Debt

**Domain thresholds and form constants hard-coded in Python:**
- Issue: CLAUDE.md requires standards to live in the database, but `determination.py` hard-codes IRS/433-A values: the `$1,000` bank reserve, `0.8` haircut, `$3,450` vehicle exemption, `$11,980` personal-effects deduction, `$500` CNC equity cutoff, `$50,000` Simple Payment Plan ceiling, and the age cutoffs `30`/`65` for health-care standards.
- Files: `src/determination.py` (`calculate_net_realizable_equity`, `determine_resolution_path`, `calculate_allowable_expenses`)
- Impact: Annual IRS updates require code edits and redeploys; the values cannot be traced to a versioned source row. The `$500` and `$50,000` values are policy thresholds with no citation in code.
- Fix approach: Move the constants into a versioned table (for example `irs_form_constants`) seeded from `src/schemas/lookup_standards.seed.sql`, read through `StandardsRepository`, and cite the source in the seed comments. Add a targeted test for each value before changing it.

**Unused `tax_only_balance` and OIC inputs:**
- Issue: `FinancialData.tax_only_balance` and `oic_payment_months` are populated but never read by `determination.py`. The OIC path has no lump-sum calculation; equity-funded OIC cases only return a "MANUAL REVIEW" result.
- Files: `src/financial_data.py`, `src/determination.py`, `src/intake_workflow.py` (`missing_question_ids` special-cases `tax_only_balance`)
- Impact: Users may read the screen as a recommendation for an offer amount that the engine does not compute. Dead fields add confusion.
- Fix approach: Either implement the OIC calculation with an authoritative source and tests, or document the fields as reserved and remove them from required-question logic.

**Case API and frontend are local-only prototypes:**
- Issue: `src/case_api.py` is a stdlib `ThreadingHTTPServer` with a hand-written multipart parser (`_read_form`), a comment noting quoted filenames only, and a `_MAX_BODY` comment that the whole body is read into memory.
- Files: `src/case_api.py` (`_read_form`, `_Handler.do_POST`, `_MAX_BODY`), `src/frontend/vite.config.js` (dev proxy `/api` to `127.0.0.1:8000`)
- Impact: Parsing bugs for RFC 5987 filenames or unusual multipart encodings silently drop uploads. No production deployment path is defined.
- Fix approach: Keep it a dev harness, or move to a framework server with a tested multipart parser before any hosting.

**Dead Supabase client:**
- Issue: `src/frontend/src/supabase/client.ts` creates a Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, but no module imports it. The frontend uses `fetch("/api/cases")` in `src/frontend/src/case-processing.ts`.
- Files: `src/frontend/src/supabase/client.ts`, `src/frontend/src/case-processing.ts`
- Impact: Dead code that still throws at import time if env vars are missing. It conflicts with the documented Supabase integration path, so the architecture is unclear.
- Fix approach: Remove it, or wire it in with a documented data-flow decision.

**Large tracked build artifacts and env files:**
- Issue: `src/frontend/dist/` (built JS and CSS) is tracked in git. `src/frontend/.env` is NOT tracked (verified with `git ls-files`), but the root `.gitignore` has a merged line `.envnode_modules/` so neither `.env` nor `node_modules/` is actually matched by that file.
- Files: `src/frontend/dist/assets/index-VH1vny-G.js`, `src/frontend/dist/index.html`, `src/frontend/.env`
- Impact: Build output diffs obscure real changes. A committed `src/frontend/.env` may expose frontend configuration. This review did not read its contents; the file name alone was checked.
- Fix approach: Split the merged `.gitignore` line into `.env` and `node_modules/`, add `**/.env`, and untrack `src/frontend/dist/` with `git rm -r --cached`.

**Uncommitted work on core files:**
- Issue: `git status` shows uncommitted changes to `src/document_parse.py`, `src/tests/test_document_parse.py`, `AGENTS.md`, and frontend package files, plus untracked `docs/`, `Discovery/`, and `CLAUDE.md`.
- Files: `src/document_parse.py`, `src/tests/test_document_parse.py`, `src/frontend/package.json`, `src/frontend/package-lock.json`
- Impact: The extraction pipeline that produces `FinancialData` can change without review or history.
- Fix approach: Commit or stash these changes with a reviewed diff before the next determination release.

## Known Bugs

**Silent defaults in `FinancialData`:**
- Symptoms: Every money field defaults to `0.0`, ages default to `0`, `csed_months_remaining` defaults to `120`, and `all_returns_filed` defaults to `True`. Code that builds `FinancialData` without every value gets "known zero" or "compliant" facts that were never provided.
- Files: `src/financial_data.py`, `src/document_parse.py` (builds `FinancialData` from extracted fields)
- Trigger: Constructing `FinancialData` directly, or a partial extraction that omits a key.
- Workaround: `financial_data_from_case_row` in `src/intake_workflow.py` blocks on missing columns, so the database path is safe. The extraction and demo paths are not guarded.

**Negative or zero CSED edge case:**
- Symptoms: `csed_months` is clamped to a minimum of `1` in `determine_resolution_path`, but the Simple Payment Plan check uses `fd.csed_months_remaining > 0`. A value of `0` therefore falls through to the manual-review branch with an unclear reason.
- Files: `src/determination.py`
- Trigger: A transcript where the CSED has expired or is unknown recorded as `0`.
- Workaround: None. Add an explicit blocked or manual-review reason for `csed_months_remaining <= 0`.

**Errors hidden behind a generic message:**
- Symptoms: Any exception from the database path returns "Could not read IRS standards from DATABASE_URL." with no logged detail.
- Files: `src/case_api.py` (`result_for_row`)
- Trigger: Bad SQL, a missing `canonical_state_name` function, or a DB outage.
- Workaround: None; the cause is only visible by reproducing outside the server.

## Security Considerations

**Client documents sent to a third-party LLM:**
- Risk: Bank statements, IRS transcripts, and pay stubs are sent to OpenRouter for classification and field extraction. Text is truncated to `_TEXT_LIMIT` before sending, and the data is personal tax information.
- Files: `src/document_parse.py` (`_llm_json`, `_llm_fill`, `_classification_error`, `_CHAT_URL`)
- Current mitigation: Model and key come from environment variables. Results are checked by `_accept_fields` and `_complete_document`.
- Recommendations: Confirm the contract and retention terms with the provider for taxpayer data. Add a redaction step (SSN, account numbers) before the LLM call. Log which fields were AI-extracted, and require tax-professional confirmation of those fields before determination (the `ai_flags` field exists for this but is not enforced).

**Unauthenticated local HTTP endpoint:**
- Risk: `src/case_api.py` accepts POST requests on `127.0.0.1:8000` with no authentication, no CSRF token, and no origin check. A browser page open on the same machine can submit multipart requests to it.
- Files: `src/case_api.py` (`_Handler`, `main`)
- Current mitigation: Bound to loopback only.
- Recommendations: Restrict the `Origin` header to the Vite dev origin, reject requests without `Content-Type: multipart/form-data`, and do not expose the server beyond loopback.

**No row-level security in the database schema:**
- Risk: `src/schemas/database_schema.sql` creates `cases`, `case_financial_data`, `documents`, and `document_extractions` tables with no `ENABLE ROW LEVEL SECURITY` statements or policies. If these tables are exposed through Supabase's PostgREST API, anyone with the publishable key can read them.
- Files: `src/schemas/database_schema.sql`
- Current mitigation: None found in the repository.
- Recommendations: Enable RLS on all case and document tables and write policies scoped to the authenticated tax professional before any Supabase exposure.

**Secrets handling:**
- Risk: `src/document_parse.py` (`_load_env`) reads the repository-root `.env` and sets `os.environ` at runtime. `.env.example` is tracked and should contain names only. `src/frontend/.env` exists locally but is not tracked; the root `.gitignore` pattern is broken (see Tech Debt).
- Files: `src/document_parse.py` (`_load_env`), `.env.example`, `src/frontend/.env`
- Current mitigation: Neither `.env` file is tracked today, but only by luck: the root `.gitignore` pattern is malformed. `.env.example` was checked for variable names only, with no values printed.
- Recommendations: Fix the `.gitignore` pattern before the next commit so `.env` files can never be added.

## Performance Bottlenecks

**One database connection per request:**
- Problem: `_from_database` in `src/case_api.py` opens a new `psycopg.connect` on every case submission.
- Files: `src/case_api.py` (`_from_database`), `src/standards_repository.py`
- Cause: No connection pool; each lookup query also runs separately.
- Improvement path: Use a connection pool or cache standards per process, since the standards change rarely.

**Whole-upload in-memory processing:**
- Problem: Uploads are read into memory (`_MAX_BODY` is 32 MB) and each PDF is written to a temp directory before parsing.
- Files: `src/case_api.py` (`_parsed`, `_MAX_BODY`), `src/document_parse.py`
- Cause: Synchronous single-request parsing with a `ThreadingHTTPServer`.
- Improvement path: Stream uploads to disk and parse with a bounded worker pool.

## Fragile Areas

**Hand-coded IRS decision tree:**
- Files: `src/determination.py`
- Why fragile: The branch order in `determine_resolution_path` decides the outcome. Changing the CNC threshold (`nre <= 500`) or reordering the Simple Payment Plan and Non-Simple checks changes which path a taxpayer sees. Three branches share the same `csed_payment`.
- Safe modification: Change one branch at a time, with a fixture per branch, and get CPA/EA review before changing wording or thresholds (CLAUDE.md requires this).
- Test coverage: No `src/tests/test_determination.py` exists. Determination is only exercised indirectly through `test_intake_workflow.py` and `test_case_api.py`.

**Vehicle equity logic with two code paths:**
- Files: `src/determination.py` (`calculate_net_realizable_equity`)
- Why fragile: Per-vehicle lists and legacy totals (`vehicle_market_value_total`) produce different exemption counts. The exemption rule for vehicle index 1 depends on `filing_joint_offer`. The legacy branch uses `min(vehicle_count, ...)` even when the list is empty.
- Safe modification: Prefer the per-vehicle list and remove the legacy branch once no caller uses totals.
- Test coverage: Not covered by a dedicated test.

**Hand-rolled multipart and PDF parsing:**
- Files: `src/case_api.py` (`_read_form`, `_disposition`), `src/document_parse.py` (954 lines, over the 500-line project limit)
- Why fragile: Regex-based header parsing and template-based text extraction depend on exact label text in each form.
- Safe modification: Add a fixture for each document template before changing label matching.
- Test coverage: `src/tests/test_document_parse.py` covers parsing; `src/tests/test_case_api.py` has 83 lines and does not exercise malformed multipart input.

## Scaling Limits

**Single-process local server:**
- Current capacity: One `ThreadingHTTPServer` on port 8000, one connection per request.
- Limit: Concurrent uploads of large PDFs exhaust memory and compete for the single database connection pattern above.
- Scaling path: Move to a managed server with a connection pool and bounded upload size.

## Dependencies at Risk

**`psycopg` is imported lazily and not declared:**
- Risk: `src/case_api.py` (`_from_database`) and `src/demo.py` import `psycopg` at runtime. No `requirements.txt` or `pyproject.toml` was found in the repository.
- Impact: A fresh environment fails at the database step with an unclear message (surfaced only as "Install psycopg to look up IRS standards").
- Migration plan: Add a pinned dependency file for the Python side.

**Frontend dependencies:**
- Risk: `package.json` pins `vitest ^5.0.2` and `vite ^6.1.0`, and `@material/web ^2.5.0`. The `package-lock.json` change is uncommitted.
- Impact: Lockfile drift between machines.
- Migration plan: Commit the lockfile after review; run `npm test` and `npm run build` to confirm.

## Missing Critical Features

**No determination tests:**
- Problem: `src/tests/` has only `test_case_api.py`, `test_document_parse.py`, and `test_intake_workflow.py`. The IRS calculation module has no direct unit tests.
- Blocks: Safe changes to thresholds, formulas, and branch order in `determination.py`.

**Compliance gates are partial:**
- Problem: Only `all_returns_filed` and `in_open_bankruptcy` block evaluation. `prior_ia_or_oic_default`, `filed_bankruptcy_past_7yrs`, `in_litigation`, and `installment_agreement_last_5_years` only produce review flags.
- Blocks: A fully automated screen that matches the intended eligibility rules. This is a domain decision and should be confirmed by a CPA/EA.

## Test Coverage Gaps

**Determination arithmetic:**
- What's not tested: Each `calculate_*` function and each branch of `determine_resolution_path`, including the `csed_months_remaining <= 0` edge case and the vehicle exemption indices.
- Files: `src/determination.py`
- Risk: Incorrect payment or equity figures could reach a tax professional without any failing test.
- Priority: High

**Standards repository SQL:**
- What's not tested: `src/standards_repository.py` queries run against a fake repository only. The SQL functions `canonical_state_name` and `normalize_county_name` are not covered by a live-database test.
- Files: `src/standards_repository.py`, `src/schemas/database_schema.sql`
- Risk: Lookup mismatches (for example a county suffix or state alias) silently select the wrong standard.
- Priority: High

**Frontend upload and result rendering:**
- What's not tested: Upload error paths and malformed server responses in `src/frontend/src/case-processing.ts` and `src/frontend/src/resolution-results/screen.ts`. `screen.ts` renders `innerHTML` from server values, so unescaped text would be an injection risk.
- Files: `src/frontend/src/case-processing.ts`, `src/frontend/src/resolution-results/screen.ts`, `src/frontend/src/document-upload/screen.ts`
- Risk: Untrusted extracted document text rendered as HTML.
- Priority: Medium

**Files over the 500-line project limit:**
- `src/document_parse.py` is 954 lines and `src/tests/test_document_parse.py` is 558 lines. Both exceed the project's 500-line rule in CLAUDE.md and should be split by template or responsibility.

---

*Concerns audit: 2026-10-10*
