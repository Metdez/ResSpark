---
last_mapped_commit: ba83e4e43838595a38647e26882014745b62d476
last_mapped_at: 2026-10-10
---
# Testing Patterns

**Analysis Date:** 2026-10-10

## Test Framework

**Python runner:**
- `unittest` (standard library). No pytest config exists.
- Config: none. Discovery is driven by the command line.

**Python assertions:** `unittest.TestCase` assertions (`assertEqual`, `assertIn`, `assertRaises`).

**TypeScript runner:**
- Vitest `^5.0.2` (`src/frontend/package.json`).
- Config: `src/frontend/vitest.config.ts` (sets `setupFiles: ["./src/test-setup.ts"]`).
- DOM environment: jsdom `^26.0.0`. Enabled per file with the `// @vitest-environment jsdom` pragma at the top of each test file.
- Assertions: Vitest `expect`, plus `vi` for mocks and stubs.

**Run commands:**

```bash
python -m unittest discover -s src/tests -v   # Run all Python tests (from repo root)
python -m unittest src/tests/test_case_api.py  # Run one Python file
cd src/frontend && npm test                    # Run all Vitest tests (vitest run)
cd src/frontend && npx vitest                  # Watch mode
cd src/frontend && npx tsc --noEmit            # Type-check (part of npm run build)
```

No coverage command is configured. Python coverage is not measured. Vitest coverage is not configured.

## Test File Organization

**Python location:** separate directory. All tests live in `src/tests/`:
- `src/tests/test_intake_workflow.py`: workflow, question applicability, document requests, financial-column checks.
- `src/tests/test_case_api.py`: multipart parsing and the `/api/cases` response shape.
- `src/tests/test_document_parse.py`: PDF/text parsing, classification, and the optional LLM fallback (mocked).

**TypeScript location:** co-located with the source, same folder:
- `src/frontend/src/app.test.ts`, `src/frontend/src/flow.test.ts`, `src/frontend/src/case-processing.test.ts`.
- `src/frontend/src/document-upload/requests.test.ts`, `src/frontend/src/document-upload/screen.test.ts`.
- `src/frontend/src/resolution-results/screen.test.ts`.

**Naming:**
- Python: `test_<module>.py`, class `<Thing>Tests(unittest.TestCase)` (`CaseApiTests`, `DocumentParseTests`, `V5IntakeWorkflowTests`), methods `test_<behavior_in_words>`.
- TypeScript: `<module>.test.ts`, `describe("<unit>")` with `it("<behavior sentence>")`.

**Structure:**

```
src/tests/
  test_case_api.py
  test_document_parse.py
  test_intake_workflow.py
src/frontend/src/
  case-processing.ts
  case-processing.test.ts
  document-upload/
    screen.ts
    screen.test.ts
    requests.ts
    requests.test.ts
```

Note: `src/tests/__init__.py` is not present. Discovery works with `-s src/tests`.

## Test Structure

**Python suite organization (`src/tests/test_intake_workflow.py`):**

```python
V5_DIRECTORY = Path(__file__).resolve().parents[1]
if str(V5_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(V5_DIRECTORY))

from intake_workflow import evaluate_case, ...

class FakeStandardsRepository:
    """Keeps workflow tests independent from a running PostgreSQL server."""
    def national_amount(self, household_size: int) -> float: ...

STANDARDS = FakeStandardsRepository()

class V5IntakeWorkflowTests(unittest.TestCase):
    def test_...(self):
        ...

if __name__ == "__main__":
    unittest.main()
```

**Patterns:**
- Setup: module-level fixtures such as `STANDARDS` and `canonical_zero_row()` (defined in `src/tests/test_intake_workflow.py`) are reused by other test modules (`from test_intake_workflow import STANDARDS, canonical_zero_row` in `src/tests/test_case_api.py`). Keep shared fixtures in `test_intake_workflow.py` or move them to a new `src/tests/fixtures.py`.
- Teardown: none needed. Use `patch.dict` context managers, which clean up automatically.
- Assertions: `assertEqual` for values, `assertIn` for review-note text, and `assertRaises` for error types.
- Every Python test module ends with `if __name__ == "__main__": unittest.main()`.

**Vitest suite organization (`src/frontend/src/case-processing.test.ts`):**

```typescript
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { processCase } from "./case-processing";

describe("case processing API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts answers, document metadata, and files to the production endpoint", async () => {
    ...
  });
});
```

**Patterns:**
- `afterEach` cleans global state: `vi.unstubAllGlobals()` in `src/frontend/src/case-processing.test.ts`, `document.body.replaceChildren()` in `src/frontend/src/document-upload/screen.test.ts`.
- DOM tests build a root element, append it to `document.body`, render, then query with `querySelector` against `data-*` attributes.
- Simulate file input by overriding `files` and dispatching `change` (see `src/frontend/src/document-upload/screen.test.ts`).

## Mocking

**Python framework:** `unittest.mock` (`patch`, `patch.dict`).

**Patterns:**

```python
with patch.dict(os.environ, _ENV if env is None else env), \
        patch("document_parse.urllib.request.urlopen", fake_urlopen):
    ...
```

Source: `src/tests/test_document_parse.py`. Patch the name where it is looked up (`document_parse.urllib.request.urlopen`), not the stdlib module.

Use a `fail_if_called` stub to assert that a network call does not happen (for example when `OPENROUTER_API_KEY` is empty, `src/tests/test_document_parse.py` around line 317).

**Python fake repository:**
- Standards are faked with a plain class that implements the `StandardsRepository` protocol methods (`FakeStandardsRepository` in `src/tests/test_intake_workflow.py`). No `Mock` objects are used for it. Add new standards methods to the fake whenever the protocol grows.

**TypeScript framework:** Vitest `vi`.

**Patterns:**

```typescript
const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
vi.stubGlobal("fetch", fetch);
...
expect(fetch).toHaveBeenCalledWith("/api/cases", expect.objectContaining({ method: "POST" }));
```

**Module mocks:** `src/frontend/src/test-setup.ts` mocks `@material/web/select/outlined-select.js` with a lightweight `HTMLElement` class that exposes `value`. It also stubs `select-option.js`. Tests therefore do not load Material Web components. Keep new Material Web imports covered by this file.

**What to Mock:**
- Python: the standards repository (use the fake), network calls to OpenRouter (`urllib.request.urlopen`), and environment variables (`patch.dict(os.environ, ...)`).
- TypeScript: `fetch` (via `vi.stubGlobal`), and Material Web custom elements (via `test-setup.ts`).

**What NOT to Mock:**
- Do not mock `determination.py` or `intake_workflow.py` calculation. Assert on real results, as the tests do with `STANDARDS`.
- Do not mock the PDF/text parsing logic. `src/tests/test_document_parse.py` uses real text fixtures.
- Do not require a live PostgreSQL database. The contract in `CLAUDE.md` and `AGENTS.md` is that tests use a fake repository.

## Fixtures and Factories

**Test data:**
- Canonical case rows are built by a helper, `canonical_zero_row()` in `src/tests/test_intake_workflow.py`. Override only the fields the test cares about.
- Real synthetic packet files are used from `examples/` (for example `examples/01_marcus_delgado_CNC/05_Lease_Statement.pdf` in `src/tests/test_case_api.py`). These are synthetic; do not replace them with real client data.
- Multipart bodies are built by a `_body(fields, files)` helper in `src/tests/test_case_api.py`.
- Frontend fixtures are inline (`new File(["transcript"], "name.pdf", { type: "application/pdf" })`).

**Location:**
- Python: inline in test modules, or shared through imports from another test module.
- Frontend: inline in each test file.

## Coverage

**Requirements:** None enforced. No coverage threshold or tool is configured.

**Gaps observed:**
- `src/demo.py` and the database paths of `src/standards_repository.py` (`PostgresStandardsRepository`) have no tests. They need a live database, which is out of scope for unit tests. Test the query construction with a fake DB-API connection instead.
- `src/frontend/src/supabase/client.ts` has no test. It throws when env vars are missing; a test with `vi.stubEnv` would cover it.
- `src/frontend/src/main.ts` has no test.

## Test Types

**Unit tests:**
- Python: pure calculation and workflow functions (`src/determination.py`, `src/intake_workflow.py`, `src/financial_data.py`). Use the fake standards repository.
- TypeScript: pure modules (`case-processing.ts`, `requests.ts`, `resolution-results/model.ts`).

**Integration tests:**
- `src/tests/test_case_api.py` exercises the HTTP handler's request parsing and response shape end to end (multipart bytes in, JSON out), using the fake standards repository and real example PDFs.
- `src/frontend/src/flow.test.ts` and `src/frontend/src/app.test.ts` exercise the multi-screen flow in jsdom.

**E2E tests:** Not used. No Playwright or Cypress configuration exists.

## Common Patterns

**Async testing (Vitest):**

```typescript
await expect(processCase({ answers: {}, documents: [] })).resolves.toBe(result);
await expect(processCase({ answers: {}, documents: [] })).rejects.toThrow("invalid result");
```

**Error testing (Python):**

```python
with self.assertRaises(ValueError):
    ...
```

Assert on the exception type and, where the message matters, `assertIn` on the message text (`"Set DATABASE_URL"` in the demo path).

**Review-note testing (Python):** Review output is a list of strings. Assert with `assertIn` on the exact text, as in `src/tests/test_case_api.py` (`"notes.png: No readable text."`).

**Numeric assertions:** Use `assertEqual` for exact dollar values from the fake standards (for example `housing["value"] == 1150`). Use the same fake values for every test so results are reproducible.

## Gaps and Recommendations

- Add a `src/tests/__init__.py` or a documented discovery command so IDE runners find the tests.
- Split `src/tests/test_document_parse.py` (558 lines) to respect the 500-line rule, one file per document family.
- Each new non-trivial logic branch needs a test. Changes to thresholds, formulas, or eligibility gates need targeted tests and a cited source (`AGENTS.md`).
- Add a companion Markdown file under `docs/` for each new test module, mirroring the source path.

---

*Testing analysis: 2026-10-10*
