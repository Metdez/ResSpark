# Testing Patterns

**Analysis Date:** 2026-09-27

## Test Framework

**Runner:**
- Python standard-library `unittest` (runtime-provided) discovers tests under `src/tests/`; no separate Python test configuration or dependency manifest is present. Entry points are `src/tests/test_case_api.py`, `src/tests/test_document_parse.py`, and `src/tests/test_intake_workflow.py`.
- Vitest `^5.0.2` runs TypeScript tests under `src/frontend/src/`, configured by `src/frontend/vitest.config.ts` and declared in `src/frontend/package.json`.
- jsdom `^26.0.0` provides browser APIs for files marked `// @vitest-environment jsdom`, including `src/frontend/src/app.test.ts`, `src/frontend/src/case-processing.test.ts`, `src/frontend/src/document-upload/screen.test.ts`, and `src/frontend/src/resolution-results/screen.test.ts`.

**Assertion Library:**
- Python uses `unittest.TestCase` assertions such as `assertEqual`, `assertIn`, `assertRaises`, and `assertIsInstance` in `src/tests/test_intake_workflow.py` and `src/tests/test_document_parse.py`.
- TypeScript uses Vitest's `expect` API and async helpers, including `toEqual`, `toMatchObject`, `rejects.toThrow`, and `vi.waitFor` in `src/frontend/src/case-processing.test.ts` and `src/frontend/src/app.test.ts`.

**Run Commands:**
```bash
python -m unittest discover -s src/tests -v  # Run all Python tests from the repository root
cd src/frontend && npm test                 # Run all frontend tests once
cd src/frontend && npx vitest               # Run frontend tests in watch mode
```

The current suites comprise 30 Python tests across `src/tests/` and 49 Vitest tests across six `*.test.ts` files in `src/frontend/src/`. Both complete commands pass as of 2026-09-27.

## Test File Organization

**Location:**
- Keep Python tests in the separate `src/tests/` directory and name them `test_<module>.py`, matching `src/tests/test_case_api.py`, `src/tests/test_document_parse.py`, and `src/tests/test_intake_workflow.py`.
- Co-locate TypeScript tests with their implementation: `src/frontend/src/flow.test.ts` beside `src/frontend/src/flow.ts`, and `src/frontend/src/document-upload/screen.test.ts` beside `src/frontend/src/document-upload/screen.ts`.
- Use repository synthetic PDFs under `examples/` as deterministic document fixtures; the coverage is exercised from `src/tests/test_document_parse.py` and `src/tests/test_case_api.py`.

**Naming:**
- Python test classes end in `Tests`, and methods use descriptive `test_<expected_behavior>` names, as in `DocumentParseTests.test_model_fallback_rejects_bad_replies_and_missing_credentials` in `src/tests/test_document_parse.py`.
- TypeScript suites use a feature noun phrase in `describe`, while cases use behavior sentences in `it`, as in `src/frontend/src/document-upload/requests.test.ts` and `src/frontend/src/resolution-results/screen.test.ts`.

**Structure:**
```text
src/tests/
├── test_case_api.py
├── test_document_parse.py
└── test_intake_workflow.py

src/frontend/src/
├── app.test.ts
├── case-processing.test.ts
├── flow.test.ts
├── document-upload/
│   ├── requests.test.ts
│   └── screen.test.ts
└── resolution-results/
    └── screen.test.ts
```

## Test Structure

**Suite Organization:**

Use Arrange-Act-Assert spacing and a behavior-focused suite, following `src/frontend/src/case-processing.test.ts`:

```typescript
describe("case processing API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an unsuccessful API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(processCase({ answers: {}, documents: [] }))
      .rejects.toThrow("Case submission failed (503).");
  });
});
```

Use one `unittest.TestCase` class per feature boundary, following `src/tests/test_intake_workflow.py`:

```python
class V5IntakeWorkflowTests(unittest.TestCase):
    def test_explicit_zero_is_accepted_as_known_data(self):
        row = canonical_zero_row()

        self.assertNotIn("gross_wages_taxpayer", missing_financial_columns(row))
        financial_data = financial_data_from_case_row(row)
        self.assertEqual(financial_data.gross_wages_taxpayer, 0.0)
```

**Patterns:**
- Build the smallest input that exposes the rule, call the public boundary, then assert the domain-visible result. Examples are `evaluate_case` cases in `src/tests/test_intake_workflow.py` and `getDocumentRequests` cases in `src/frontend/src/document-upload/requests.test.ts`.
- Assert exact values for tax math, document classification, serialized payloads, and validation messages in `src/tests/test_intake_workflow.py`, `src/tests/test_document_parse.py`, `src/frontend/src/case-processing.test.ts`, and `src/frontend/src/flow.test.ts`.
- Assert both positive and negative UI state when conditional rendering matters, such as `toContain` plus `not.toContain` in `src/frontend/src/app.test.ts` and `src/frontend/src/document-upload/screen.test.ts`.
- Exercise failure causes, not only the outer exception message. `src/tests/test_document_parse.py` checks `caught.exception.__cause__` for malformed model responses and connection errors.
- Use `it.each` for compact TypeScript decision tables, as in excluded document categories and vehicle slot counts in `src/frontend/src/document-upload/requests.test.ts`.

## Mocking

**Framework:**
- Python uses `unittest.mock.patch`, particularly `patch.dict` for environment variables and `patch` for `urllib.request.urlopen` in `src/tests/test_document_parse.py`.
- TypeScript uses Vitest `vi.fn`, `vi.spyOn`, `vi.stubGlobal`, and `vi.mock` in `src/frontend/src/app.test.ts`, `src/frontend/src/case-processing.test.ts`, and `src/frontend/src/test-setup.ts`.

**Patterns:**

Mock Python HTTP responses with a context-manager-compatible byte stream, as in `src/tests/test_document_parse.py`:

```python
class _Response(BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

with patch.dict(os.environ, _ENV), \
        patch("document_parse.urllib.request.urlopen", fake_urlopen):
    parsed = parse_texts(_UNMATCHED, document_type="lease_statement")
```

Stub browser globals at the public network boundary, as in `src/frontend/src/case-processing.test.ts`:

```typescript
const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
vi.stubGlobal("fetch", fetch);

await expect(processCase(submission)).resolves.toBe(result);
```

**What to Mock:**
- Replace live standards access with the interface-compatible `FakeStandardsRepository` and shared `STANDARDS` fixture in `src/tests/test_intake_workflow.py`; Python unit tests must not require PostgreSQL.
- Replace model/network calls with local `urlopen` fakes and controlled environment mappings in `src/tests/test_document_parse.py`; never call Sciforium from the unit suite.
- Replace `fetch`, confirmation dialogs, callbacks, and Material Web custom elements at the browser boundary using `src/frontend/src/case-processing.test.ts`, `src/frontend/src/app.test.ts`, and the global setup in `src/frontend/src/test-setup.ts`.
- Inject a case processor into `createApp` rather than mocking its module when testing the whole frontend flow, following `src/frontend/src/app.test.ts` and the injectable signature in `src/frontend/src/app.ts`.

**What NOT to Mock:**
- Do not mock deterministic calculation and workflow modules when testing screening paths; use real `evaluate_case` and `result_for_row` behavior with only the standards repository replaced, as in `src/tests/test_intake_workflow.py` and `src/tests/test_case_api.py`.
- Do not mock synthetic reference PDFs for parser coverage. Read the committed fixtures in `examples/` through the real parser, as in `src/tests/test_document_parse.py`.
- Do not mock pure frontend selectors/validators. Test `getApplicableQuestions`, `validateAnswer`, `parseAnswer`, and `getDocumentRequests` directly in `src/frontend/src/flow.test.ts` and `src/frontend/src/document-upload/requests.test.ts`.

## Fixtures and Factories

**Test Data:**

Create complete canonical records from dataclass defaults, then override only the scenario facts, following `src/tests/test_intake_workflow.py`:

```python
def canonical_zero_row() -> dict:
    row = {}
    for name, definition in FinancialData.__dataclass_fields__.items():
        if definition.default_factory is not MISSING:
            row[name] = definition.default_factory()
        else:
            row[name] = definition.default
    row["tax_only_balance"] = 0.0
    row.update({
        "pay_frequency": "biweekly",
        "has_real_property": False,
        "has_retirement_accounts": False,
        "has_life_insurance_cash_value": False,
        "has_investment_accounts": False,
    })
    return row
```

Build typed frontend result data in a local factory when multiple UI cases vary only one field, following `result(documentName)` in `src/frontend/src/resolution-results/screen.test.ts`.

**Location:**
- Shared Python workflow fixtures live in `src/tests/test_intake_workflow.py` and are imported by `src/tests/test_case_api.py`; keep broadly reused case-row factories there unless a dedicated fixture module becomes necessary.
- Document fixtures live under `examples/01_marcus_delgado_CNC/`, `examples/02_whitfield_gregory_OIC/`, and `examples/03_renata_alves_streamlined_IA/`; they are synthetic inputs, not production data.
- One-test filesystem artifacts belong in `tempfile.TemporaryDirectory`, as in the unreadable-upload case in `src/tests/test_document_parse.py`.
- Frontend DOM fixtures are created inside each test with `document.createElement`, `File`, and `FormData`, as in `src/frontend/src/app.test.ts`, `src/frontend/src/document-upload/screen.test.ts`, and `src/frontend/src/case-processing.test.ts`.

## Coverage

**Requirements:** No numeric coverage target or coverage configuration is enforced in the repository root, `src/tests/`, or `src/frontend/`. Behavior-change coverage is required by `AGENTS.md`, especially normal, boundary, and missing-data cases for calculations.

**View Coverage:**
```bash
# Not configured: no Python coverage tool, Vitest coverage provider, or coverage script is declared.
```

Use behavior coverage as the current standard: calculation changes need normal, threshold/boundary, and missing-data tests in `src/tests/test_intake_workflow.py`; schema/repository changes need parameter/interface tests without a live database, per `AGENTS.md`.

## Test Types

**Unit Tests:**
- Pure calculation/workflow behavior is tested through `src/tests/test_intake_workflow.py`, including unknown-versus-zero handling, compliance blocking, CNC, simple-plan, OIC, and manual-review paths.
- Parsing, merging, coercion, fallback validation, and classification are tested in `src/tests/test_document_parse.py` with local text/PDF inputs and network mocks.
- Pure frontend flow and document-request rules are tested in `src/frontend/src/flow.test.ts` and `src/frontend/src/document-upload/requests.test.ts`.

**Integration Tests:**
- `src/tests/test_case_api.py` exercises multipart body parsing, uploaded files, parser output, workflow evaluation, and JSON response construction without starting a server or connecting to PostgreSQL.
- `src/tests/test_document_parse.py` reads the committed synthetic PDF packets end-to-end through extraction, classification, parsing, and merging.
- `src/frontend/src/app.test.ts` drives the questionnaire, session storage, document screen, injected processor, and result rendering together under jsdom.
- `src/frontend/src/document-upload/screen.test.ts` and `src/frontend/src/resolution-results/screen.test.ts` render real DOM and dispatch browser-style events rather than snapshotting HTML.

**E2E Tests:**
- No browser automation or live frontend-to-Python E2E framework is used. There is no Playwright, Cypress, or Selenium configuration in the repository or `src/frontend/package.json`.
- Database-backed demo execution in `src/demo.py` is manual and is not part of either automated suite.

## Common Patterns

**Async Testing:**

Await the promise directly for API units and use `vi.waitFor` for UI changes that occur after event handlers, following `src/frontend/src/case-processing.test.ts` and `src/frontend/src/app.test.ts`:

```typescript
await expect(processCase({ answers: {}, documents: [] }))
  .rejects.toThrow("Case submission failed (503).");

await vi.waitFor(() => expect(root.textContent).toContain("Uploaded documents"));
```

**Error Testing:**

Use context-managed exception assertions in Python and verify message/cause when the distinction matters, following `src/tests/test_document_parse.py`:

```python
with self.assertRaises(ValueError) as caught:
    _with_model("nope", "bank_statements")
self.assertIsInstance(caught.exception.__cause__, ValueError)
```

For frontend errors, stub the failed boundary and assert the user- or caller-visible contract, following `src/frontend/src/case-processing.test.ts` and `src/frontend/src/document-upload/screen.test.ts`:

```typescript
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
await expect(processCase({ answers: {}, documents: [] }))
  .rejects.toThrow("Case submission failed (503).");
```

**DOM Cleanup:**
- Clear shared browser state after every test. `src/frontend/src/app.test.ts` clears `sessionStorage`, replaces `document.body` children, and restores mocks; other DOM suites at least replace the body in `src/frontend/src/document-upload/screen.test.ts` and `src/frontend/src/resolution-results/screen.test.ts`.
- Undo stubbed globals with `vi.unstubAllGlobals`, following `src/frontend/src/case-processing.test.ts`, so test ordering cannot leak a fake `fetch`.

**Boundary Testing:**
- For tax calculations, assert values exactly at and around eligibility gates and missing-data conditions, following zero-versus-`None`, simple-plan, OIC, and manual-review cases in `src/tests/test_intake_workflow.py`.
- For external/model data, cover valid, malformed, incomplete, type-invalid, unavailable, and over-limit inputs, following response matrices and the 12,000-character truncation assertion in `src/tests/test_document_parse.py`.
- For UI accessibility and safety, assert keyboard focus, `aria`-driven states, required upload blocking, and HTML escaping in `src/frontend/src/app.test.ts`, `src/frontend/src/document-upload/screen.test.ts`, and `src/frontend/src/resolution-results/screen.test.ts`.

---

*Testing analysis: 2026-09-27*
