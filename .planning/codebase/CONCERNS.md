# Codebase Concerns

**Analysis Date:** 2026-09-27

## Tech Debt

**Unknown financial facts are converted to zero:**
- Issue: `_screenable()` fills 17 unasked income, expense, and asset fields with `0.0`, and also assumes missing spouse wages are zero. This conflicts with the repository rule that `NULL` means unknown and must block evaluation. The behavior is explicitly encoded by `_ASSUMED_ZERO` and a regression test.
- Files: `src/case_api.py`, `src/tests/test_case_api.py`, `AGENTS.md`
- Impact: Income can be understated, expenses or assets can be omitted, and a case can receive a suggested resolution path despite material facts never being supplied. A review note does not prevent the suggestion.
- Fix approach: Ask for or extract every required value, keep unavailable values as `None`, and let `missing_financial_columns()` block screening. If a domain rule permits a default, encode it field-by-field with an authoritative citation and a targeted test.

**Schema-backed canonical records are not used by the application path:**
- Issue: The SQL schema defines `cases`, `case_financial_data`, `documents`, `document_extractions`, and `determination_runs`, but `POST /api/cases` builds a transient dictionary and uses PostgreSQL only for standards lookups. No application code inserts or updates the case/audit tables.
- Files: `src/case_api.py`, `src/intake_workflow.py`, `src/schemas/database_schema.sql`
- Impact: The declared canonical-data and evidence model is not enforced in production flow; there is no durable audit trail showing source values, accepted extractions, or the financial snapshot behind a determination.
- Fix approach: Add a repository/service boundary that persists uploads and extracted facts, promotes reviewed facts into `case_financial_data`, and records each determination snapshot transactionally before returning a result.

**Question contracts are duplicated and already disagree with contributor guidance:**
- Issue: Question identifiers and prompts are maintained independently in Python, TypeScript, and SQL. The current catalogs contain 28 Python/SQL questions and 26 frontend questions, while `AGENTS.md` describes a 32-question contract.
- Files: `src/questions.py`, `src/frontend/src/questions.ts`, `src/schemas/database_schema.sql`, `AGENTS.md`, `src/frontend/src/flow.test.ts`
- Impact: Adding, removing, or changing a question can silently desynchronize UI applicability, API validation, schema mappings, and workflow completeness checks.
- Fix approach: Establish one versioned machine-readable question schema and generate the Python, TypeScript, and SQL representations. Add a cross-contract test that compares IDs, types, prompts, and intentional backend-only fields.

**Tax calculation values use binary floating point:**
- Issue: Financial inputs, standards, intermediate sums, and `Determination` amounts use `float`; `Decimal` is used only for selected parser operations and final whole-dollar OIC rounding.
- Files: `src/financial_data.py`, `src/determination.py`, `src/standards_repository.py`, `src/document_parse.py`
- Impact: Repeated additions, comparisons at eligibility boundaries, and cent rounding can diverge from exact currency math.
- Fix approach: Use `Decimal` end-to-end for money, convert database numerics without passing through `float`, define rounding at each rule boundary, and test amounts one cent below, at, and above every threshold.

**Hard-coded policy constants lack executable provenance:**
- Issue: The `$1,000` bank reserve, `$3,450` vehicle exemption, `$11,980` personal-effects deduction, `$500` meaningful-equity cutoff, `$50,000` simple-plan cutoff, asset haircuts, and OIC multipliers live directly in calculation code. Comments name IRS forms or IRM sections, but the values have no effective-date metadata or source URL, and most are not retrieved through the standards repository.
- Files: `src/determination.py`, `src/standards.py`, `src/standards_repository.py`, `forms/`
- Impact: Annual or policy-driven changes require code edits and can leave mixed vintages of rules and database standards without detection.
- Fix approach: Store changeable policy parameters with source, effective date, and version in the standards schema; snapshot the version used for each run; retain formulas in deterministic code with citations and boundary tests.

**Standards seed data has hashes but no rule-version metadata:**
- Issue: The seed records input hashes, but lookup tables do not store an effective year, publication date, source URI, or active version. Seed inserts are not idempotent and assume an empty schema.
- Files: `src/schemas/lookup_standards.seed.sql`, `src/schemas/database_schema.sql`, `src/schemas/README.md`
- Impact: Operators cannot query which IRS vintage produced a result, safely stage multiple vintages, or reapply a seed without recreating tables.
- Fix approach: Add a standards-release table and foreign keys from each standard row, validate coverage before activation, and make deployment explicitly transactional/versioned.

**Python runtime dependencies are undeclared:**
- Issue: The database path imports `psycopg`, but there is no `pyproject.toml`, `requirements.txt`, or lockfile. Installation is documented as prose only.
- Files: `src/case_api.py`, `src/demo.py`, `README.md`
- Impact: A clean environment can run unit tests yet fail when a complete case reaches PostgreSQL; dependency versions are not reproducible.
- Fix approach: Add a minimal Python project manifest with supported Python versions, a pinned/locked `psycopg` dependency, and separate development dependencies if needed.

**Document parsing is a monolith with template-specific heuristics:**
- Issue: Classification, PDF stream decoding, template parsing, merging, external-model fallback, coercion, and environment loading share one 830-line module. The parser recognizes a narrow subset of PDF text operators and document labels.
- Files: `src/document_parse.py`, `src/tests/test_document_parse.py`
- Impact: A change for one document type can affect shared merging or fallback behavior, and PDFs produced by scanners or different generators fail despite being readable by standard PDF tools.
- Fix approach: Split transport/extraction, classification, per-document adapters, merge policy, and AI fallback into separate modules behind typed results. Use a maintained PDF text/OCR boundary and keep parser fixtures for every supported variant.

## Known Bugs

**Frontend accepts image uploads that the backend cannot parse:**
- Symptoms: The upload picker accepts image files, but the API writes every upload to a temporary `.pdf` path and the parser only scans PDF stream syntax. The result reports “No readable text.”
- Files: `src/frontend/src/document-upload/screen.ts`, `src/case_api.py`, `src/document_parse.py`, `README.md`
- Trigger: Select a JPEG/PNG image of a requested tax document and submit it.
- Workaround: Upload a text-bearing PDF; scanned PDFs still require external OCR before upload.

**Partial vehicle valuations can be assigned incompletely:**
- Symptoms: When multiple loan statements exist and at least one already contains a market value, `_combine_autos()` does not use separate value-only uploads to fill the other vehicles. Extra valuation files are consulted only when no loan statement has any value.
- Files: `src/document_parse.py`, `src/tests/test_document_parse.py`
- Trigger: Upload two vehicle-loan statements, only one containing market value, plus a separate valuation for the second vehicle.
- Workaround: Ensure every loan statement contains a value or ensure all values come from separate value-only documents, then verify the full case data manually.

**Required “three months” of bank records is enforced as one file:**
- Symptoms: The UI describes three recent months but marks only the primary bank slot required; one selected file satisfies the document gate. The backend does not verify distinct statement months.
- Files: `src/frontend/src/document-upload/requests.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/document-upload/screen.test.ts`, `src/document_parse.py`
- Trigger: Select a single one-month bank statement and continue.
- Workaround: The user must voluntarily add the optional files; the professional must verify month coverage.

**Malformed or missing `Content-Length` can bypass normal API error handling:**
- Symptoms: `_Handler.do_POST()` converts the header directly with `int()` and treats a missing header as zero. Invalid or negative values are not converted into a structured 400 response, and a negative length can request an unbounded stream read.
- Files: `src/case_api.py`, `src/tests/test_case_api.py`
- Trigger: Send `POST /api/cases` with an invalid, negative, or absent `Content-Length` outside the normal browser client.
- Workaround: Run only behind a proxy that validates and caps request bodies.

**Backend and frontend result types disagree for unresolved cases:**
- Symptoms: Backend outcomes without a determination set calculation fields to `None`, while `ResolutionOutcome` declares every calculation field as `number`. The runtime response guard does not validate these fields.
- Files: `src/case_api.py`, `src/frontend/src/resolution-results/model.ts`, `src/frontend/src/case-processing.ts`
- Trigger: Submit a case with missing facts or unavailable standards and consume the numeric fields in new frontend code.
- Workaround: Current result rendering does not display those numeric fields; callers must treat them as nullable.

## Security Considerations

**Taxpayer documents can be sent to an external AI service:**
- Risk: On deterministic parse/classification failures, up to 12,000 characters of extracted tax-document text are sent to a hard-coded third-party chat-completions endpoint. The code performs no PII redaction, consent check, tenant policy check, or audit event before transmission.
- Files: `src/document_parse.py`, `src/case_api.py`, `README.md`
- Current mitigation: The fallback sends only extracted text rather than raw files, truncates input, restricts accepted output fields, and does not call the model when deterministic parsing succeeds.
- Recommendations: Make external processing an explicit deployment policy and per-case consent decision; redact taxpayer identifiers; document retention/data-processing terms; log that a transfer occurred without logging content; and provide a fully local/manual-review fallback.

**The case endpoint has no authentication or authorization:**
- Risk: Any process able to reach the server can submit sensitive documents and consume database/AI resources. Binding to loopback reduces exposure locally but is not an access-control mechanism for future deployment.
- Files: `src/case_api.py`, `src/frontend/vite.config.js`
- Current mitigation: `ThreadingHTTPServer` binds to `127.0.0.1`, and the Vite development proxy targets that loopback endpoint.
- Recommendations: Keep the current server development-only. Put any deployed API behind authenticated sessions, role/tenant authorization, TLS, CSRF/origin controls, request rate limits, and security headers.

**Sensitive questionnaire answers persist in browser session storage:**
- Risk: Intake answers remain in `sessionStorage` until submission or explicit clearing and are readable by any JavaScript executing on the same origin.
- Files: `src/frontend/src/app.ts`, `src/frontend/src/app.test.ts`
- Current mitigation: Storage is scoped to the browser tab/session and is cleared on successful submission or confirmed exit.
- Recommendations: Minimize saved fields, set a short inactivity expiry, clear on logout/tab lifecycle where practical, enforce a strict Content Security Policy, and document local-device privacy behavior.

**Upload validation trusts client metadata and uses a custom multipart parser:**
- Risk: The endpoint does not validate magic bytes, MIME type, file count, per-file size, or PDF structure. Multipart parsing uses boundary splitting and regexes rather than a standards-compliant parser. Compressed PDF streams are decompressed without an expanded-size limit.
- Files: `src/case_api.py`, `src/document_parse.py`
- Current mitigation: Total declared body size is capped at 32 MiB, files are stored in a temporary directory with generated numeric names, and original filenames are not used as filesystem paths.
- Recommendations: Use a maintained multipart implementation; validate declared and actual size, file count, magic bytes, and allowed types; cap decompressed output and parsing time; and reject malformed requests before parsing.

**Local secrets are loaded from a plaintext environment file:**
- Risk: The parser reads API credentials from a root `.env` file into process environment. A `.env` and `.env.example` are present; their contents were not inspected. Accidental local exposure or process-environment leakage can reveal service credentials.
- Files: `src/document_parse.py`, `.gitignore`, `.env`, `.env.example`
- Current mitigation: `.env` is ignored by Git and values are not returned in API responses.
- Recommendations: Use environment injection or a secrets manager outside development, keep examples value-free, rotate credentials, and never log request headers or environment values.

**Database transport policy is delegated entirely to `DATABASE_URL`:**
- Risk: The code opens whatever PostgreSQL URL is supplied without enforcing TLS or connection timeouts.
- Files: `src/case_api.py`, `src/demo.py`, `README.md`
- Current mitigation: Credentials are not hard-coded and SQL lookups use parameter binding in `src/standards_repository.py`.
- Recommendations: Require TLS verification and bounded connect/query timeouts in deployment configuration, use least-privilege read-only credentials for standards lookups, and fail closed on insecure production configuration.

## Performance Bottlenecks

**Request bodies and parsed documents are materialized repeatedly:**
- Problem: The HTTP handler reads the full body into memory, multipart parsing creates byte slices, each upload is written to disk and read back, and PDF streams may be decompressed in memory.
- Files: `src/case_api.py`, `src/document_parse.py`
- Cause: The local prototype uses `http.server`, whole-body parsing, and a synchronous parse pipeline.
- Improvement path: Stream multipart parts to bounded temporary files, impose per-file/decompressed limits, parse incrementally, and move document processing to bounded worker jobs for anything beyond local single-user use.

**Document parsing and external API calls block request threads:**
- Problem: Each request thread performs CPU parsing, filesystem work, database calls, and potentially a 60-second external HTTP call synchronously.
- Files: `src/case_api.py`, `src/document_parse.py`
- Cause: `ThreadingHTTPServer` directly invokes `case_result()` and `_llm_json()` inside the request lifecycle.
- Improvement path: Return a case/job identifier, process documents asynchronously with concurrency limits and retries, and expose status polling. Keep deterministic calculation synchronous only after validated facts exist.

**Standards deployment is a large unbatched SQL artifact:**
- Problem: `lookup_standards.seed.sql` contains over 16,000 lines of literal values and assumes direct execution as one deployment step.
- Files: `src/schemas/lookup_standards.seed.sql`, `src/schemas/README.md`
- Cause: All county and standards data is checked in as generated `INSERT` statements.
- Improvement path: Keep the reproducible artifact, but load it transactionally through staging/COPY, validate expected row counts and checksums, and atomically activate a version.

## Fragile Areas

**Deterministic resolution decision tree:**
- Files: `src/determination.py`, `src/financial_data.py`, `src/standards.py`
- Why fragile: Small changes to thresholds, rounding, ordering, or missing-value behavior can change a high-stakes suggested path. Several rules and constants are intertwined in one function.
- Safe modification: Require an authoritative IRS source, isolate the rule change, preserve exact currency semantics, and add normal/boundary/missing-data tests before modifying recommendation wording or branch order.
- Test coverage: `src/tests/test_intake_workflow.py` exercises major paths indirectly, but there is no dedicated `test_determination.py` covering each helper, every threshold, cents rounding, negative inputs, vehicle exemptions, senior household composition, or CSED edges.

**PDF parsing and cross-document merge policy:**
- Files: `src/document_parse.py`, `src/tests/test_document_parse.py`, `examples/`
- Why fragile: Behavior depends on generator-specific PDF operators, exact labels, fuzzy employer matching, document order, and special-case replacement/addition rules. `merge_documents()` mutates each input dictionary with `pop("_kind")`.
- Safe modification: Treat parser outputs as immutable typed records, add fixture PDFs/text for the exact new variant, and test multi-document collisions and source attribution explicitly.
- Test coverage: Synthetic packets cover supported templates well, but scanned/OCR PDFs, encrypted or malformed PDFs, decompression limits, boundary collisions, mixed employers/spouses, multiple businesses, and partial vehicle valuations are absent.

**Three independent applicability/request implementations:**
- Files: `src/intake_workflow.py`, `src/frontend/src/questions.ts`, `src/frontend/src/document-upload/requests.ts`
- Why fragile: Spouse, housing, wage, asset, and document-request rules are repeated across backend and frontend with no shared schema.
- Safe modification: Generate both sides from one versioned rule definition and add contract tests comparing question applicability and requested document codes for the same scenario matrix.
- Test coverage: Python and TypeScript test their own rules, but no test asserts cross-language parity.

**Database normalization and fallback lookups:**
- Files: `src/standards_repository.py`, `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`
- Why fragile: Housing and transportation results depend on state aliases, county suffix normalization, source-row ordering, and regional fallback behavior.
- Safe modification: Validate every supported state/county against a known expected lookup before activating a standards release; preserve parameterized queries and deterministic ordering.
- Test coverage: Unit tests use a fake repository. There are no repository contract tests against temporary PostgreSQL, no migration/seed tests, and no full geographic coverage verification.

## Scaling Limits

**Development HTTP server:**
- Current capacity: One Python process with one thread per request and a declared 32 MiB body cap per request.
- Limit: Concurrent large uploads, PDF decompression, and 60-second external calls can exhaust memory, threads, file descriptors, or third-party quotas. There is no backpressure or graceful job recovery.
- Scaling path: Replace `ThreadingHTTPServer` for deployment, use a production application server plus bounded upload/object storage and a worker queue, and add timeouts, quotas, health checks, and structured observability.

**No case tenancy or lifecycle enforcement:**
- Current capacity: The active API processes one anonymous request and returns one transient result; the schema can represent many cases but is unused.
- Limit: Multi-user operation cannot isolate taxpayers, resume server-side work, deduplicate documents, audit reviewers, or enforce retention/deletion policies.
- Scaling path: Introduce authenticated case ownership, repository-backed state transitions, immutable determination snapshots, document retention controls, and tenant-scoped queries.

**Single external model configuration:**
- Current capacity: One hard-coded service URL and one model identifier/API key pair for all fallback requests.
- Limit: No per-tenant policy, circuit breaker, retry budget, provider failover, or concurrency cap exists; an outage turns fallback into generic parse failures.
- Scaling path: Put AI fallback behind an injected interface with policy controls, bounded retries/circuit breaking, metrics, and a manual-review queue.

## Dependencies at Risk

**Homegrown PDF decoder:**
- Risk: `src/document_parse.py` directly decodes selected ASCII85/zlib streams and `Tj` operators instead of using a maintained PDF parser; common encodings, object streams, fonts, OCR, encryption, and malformed-file defenses are unsupported.
- Impact: Valid taxpayer documents fail unpredictably, while hostile compressed inputs can consume resources.
- Migration plan: Introduce a sandboxed, maintained PDF text extraction/OCR adapter with strict resource limits, retaining the current parser only as a tested fixture adapter during migration.

**Sciforium chat-completions service:**
- Risk: The external endpoint and OpenAI-shaped response structure are hard-coded, with no formal adapter, privacy policy enforcement, retry strategy, or response schema validation beyond JSON/key coercion.
- Impact: Provider changes, outages, or policy restrictions cause parse/classification failures and may expose sensitive tax content outside the deployment boundary.
- Migration plan: Define an extraction-provider protocol, make the endpoint/config explicit, add a disabled/manual-review provider, and validate structured responses against typed schemas.

**`psycopg` database driver:**
- Risk: It is required for complete-case standards lookup but is imported lazily and not declared in a Python dependency manifest.
- Impact: Production-only failure occurs after intake completion even though the unit suite passes.
- Migration plan: Declare and lock the supported driver version, verify it in startup health checks, and add a database-backed repository smoke test in CI.

## Missing Critical Features

**Explicit privacy/consent and retention controls:**
- Problem: The product handles bank statements, transcripts, pay records, and bankruptcy documents without an in-product external-processing disclosure, consent record, retention schedule, deletion workflow, or audit event.
- Blocks: Safe deployment with real taxpayer data and defensible handling of third-party AI processing.

**Server-side case persistence and review workflow:**
- Problem: The schema models canonical facts, evidence, statuses, and run snapshots, but the API neither persists them nor supports reviewer acceptance/correction of extracted values.
- Blocks: Professional sign-off, correction tracking, reproducible determinations, resumable cases, and auditability.

**Dependent-age modeling:**
- Problem: The health-care standard calculation derives over-65 people only from taxpayer and spouse ages; dependents have no ages. Every dependent is effectively counted under 65.
- Blocks: Accurate out-of-pocket health-care standards for households containing elderly dependents.

**OCR/scanned-document support:**
- Problem: Empty extracted text immediately fails and never reaches a local or external OCR path.
- Blocks: Processing of phone scans, image-only PDFs, and image uploads already accepted by the UI.

**Operational observability:**
- Problem: The API uses a startup `print` and default HTTP server logging; document failures become user-facing notes, but there are no structured logs, metrics, traces, request IDs, health endpoints, or audit-safe error classifications.
- Blocks: Diagnosing standards failures, parser regressions, external-provider latency, and abuse without risking taxpayer-data logging.

## Test Coverage Gaps

**Calculation boundaries and invalid values:**
- What's not tested: Direct helper behavior, every eligibility boundary, cent/whole-dollar rounding, negative monetary values, inconsistent household counts, more than two vehicles, mismatched vehicle arrays, zero/expired CSED, and very large values.
- Files: `src/determination.py`, `src/financial_data.py`, `src/tests/test_intake_workflow.py`
- Risk: A calculation regression can change the suggested IRS path without a focused failure identifying the rule.
- Priority: High

**Repository SQL and standards dataset:**
- What's not tested: Actual PostgreSQL queries, schema application, seed idempotence, county/state normalization, complete geographic coverage, amount/version validation, and missing-standard behavior through a real driver.
- Files: `src/standards_repository.py`, `src/schemas/database_schema.sql`, `src/schemas/lookup_standards.seed.sql`, `src/tests/`
- Risk: The fake repository passes while deployed lookups fail or return the wrong locality/household row.
- Priority: High

**HTTP hardening and upload abuse cases:**
- What's not tested: Missing/invalid/negative `Content-Length`, over-limit bodies at the handler level, malformed multipart headers, boundary bytes inside files, excessive file counts, spoofed MIME types, decompression bombs, request timeouts, and concurrent submissions.
- Files: `src/case_api.py`, `src/document_parse.py`, `src/tests/test_case_api.py`
- Risk: Unexpected clients can crash or exhaust the local server rather than receiving bounded errors.
- Priority: High

**External-data privacy controls:**
- What's not tested: Consent/policy gating, redaction, audit signaling, disabled-provider operation, provider timeout behavior, and assurance that sensitive document text is absent from logs/errors.
- Files: `src/document_parse.py`, `src/tests/test_document_parse.py`
- Risk: Sensitive taxpayer content can leave the system without an enforceable policy boundary.
- Priority: High

**Cross-layer contract parity:**
- What's not tested: Equality of Python, TypeScript, and SQL question definitions; backend/frontend applicability; request-code parity; and nullable API response types.
- Files: `src/questions.py`, `src/frontend/src/questions.ts`, `src/frontend/src/document-upload/requests.ts`, `src/schemas/database_schema.sql`, `src/frontend/src/resolution-results/model.ts`
- Risk: One layer accepts, omits, or interprets data differently from another.
- Priority: Medium

**Accessibility and real-browser behavior:**
- What's not tested: Keyboard and screen-reader behavior in a real browser, Material Web select integration outside jsdom, large-file upload progress, network cancellation, session expiration, and browser storage privacy behavior.
- Files: `src/frontend/src/app.ts`, `src/frontend/src/document-upload/screen.ts`, `src/frontend/src/resolution-results/screen.ts`, `src/frontend/src/*.test.ts`
- Risk: The tested DOM behavior can pass while taxpayer workflows fail in supported browsers or assistive technology.
- Priority: Medium

---

*Concerns audit: 2026-09-27*
