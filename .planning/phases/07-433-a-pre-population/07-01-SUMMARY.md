---
phase: 07-433-a-pre-population
plan: 01
subsystem: engine
tags: [typescript, python-oracle, golden-fixtures, vitest, form-433a, parity]

requires:
  - phase: 01-foundation-staff-sign-in
    provides: "Vitest worker-node project, pnpm check composition, 500-line size gate (01-02); 28-question reconciliation (01-04)"
provides:
  - "Pure TS engine in app/worker/src/engine/ (py, financial-data, standards, determination, intake-workflow, outcome), 1:1 with src/*.py"
  - "app/shared/questions.ts: 28 questions, INITIAL_QUESTION_IDS, isApplicable, validateAnswer (Worker + SPA)"
  - "src/tools/export_golden_fixtures.py oracle exporter with recorded standards-call sequences and --check freshness mode"
  - "app/worker/test/fixtures/engine/golden.json (generated; 160 cases, 140 validations)"
  - "parity.test.ts: replay-strict golden parity, breakdown/NRE lines, contract constants, engine purity"
  - "pnpm check freshness gate; test:live:file script"
affects: [07-04, 07-05, 07-06, 07-08, 07-09, evaluation-route, worksheet, staff-433a-view, client-intake]

actuals:
  tokens: 26000      # chars/4 over the hand-written diff (103,759 chars); generated golden.json adds ~219,000 more
  tasks: 3
  commits: 4
plan_head_before: dbec332c0fea6c0ec72a6a29d97dac97ffd4be2e
plan_head_after: 565034bda9dc9236e23335caa5601ebc3284c6a5

tech-stack:
  added: []
  patterns:
    - "Python oracle -> generated golden.json -> TS parity test with toEqual and a strict standards-call replay"
    - "Python builtin semantics via py.ts (pyMax/pyMin first-wins ties, left-to-right sumInOrder)"
    - "Engine purity enforced by a source-scanning test block"

key-files:
  created:
    - src/tools/export_golden_fixtures.py
    - app/worker/test/fixtures/engine/golden.json
    - app/shared/questions.ts
    - app/worker/src/engine/py.ts
    - app/worker/src/engine/financial-data.ts
    - app/worker/src/engine/standards.ts
    - app/worker/src/engine/determination.ts
    - app/worker/src/engine/intake-workflow.ts
    - app/worker/src/engine/outcome.ts
    - app/worker/src/engine/parity.test.ts
    - docs/src/tools/export_golden_fixtures.md
    - docs/app/shared/questions.md
    - docs/app/worker/src/engine/{py,financial-data,standards,determination,intake-workflow,outcome,parity.test}.md
    - .planning/phases/07-433-a-pre-population/deferred-items.md
  modified:
    - app/package.json
    - app/worker/tsconfig.json
    - app/tsconfig.app.json
    - docs/app/README.md

key-decisions:
  - "Exporter stays one file (424 lines); golden_cases.py was not split out"
  - "Breakdown parity replays the main recorded sequence strictly (the exporter asserts the second recorder made identical calls) instead of a lenient method+args lookup"
  - "golden.json records python as major.minor (3.11), so --check does not fail on a patch-level interpreter change"
  - "validations carry Python's TypeError message as well as ok, so validateAnswer is checked for wording too"
  - "missingFinancialColumns lives in financial-data.ts and is re-exported from intake-workflow.ts to avoid a circular import"
  - "Path/reason literals in determination.ts are double-quoted so a search for the Python literal finds them"

patterns-established:
  - "Golden oracle: change Python first, regenerate golden.json, pnpm check fails until regenerated, fix TS never the assertion"
  - "No JS built-in max/min, Date, fetch, Hono or Supabase in app/worker/src/engine (comments included)"

requirements-completed: [FORM-01]

coverage:
  - id: D1
    description: "TS engine reproduces every golden case exactly (status, missing ids/fields, flags, document requests, determination) with the identical standards-call sequence"
    requirement: "FORM-01"
    verification:
      - kind: unit
        ref: "app/worker/src/engine/parity.test.ts#golden parity with the Python oracle"
        status: pass
    human_judgment: false
  - id: D2
    description: "Allowable breakdown (13 keys + total) and the seven NRE lines equal Python for every complete case"
    requirement: "FORM-01"
    verification:
      - kind: unit
        ref: "app/worker/src/engine/parity.test.ts#allowable breakdown and NRE lines"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fixture coverage: 84 grid/boundary cases, 63 null cases, pay_frequency not_applicable evaluated; exporter self-checks every boundary side"
    requirement: "FORM-01"
    verification:
      - kind: unit
        ref: "app/worker/src/engine/parity.test.ts#fixture coverage"
        status: pass
      - kind: other
        ref: "python src/tools/export_golden_fixtures.py"
        status: pass
    human_judgment: false
  - id: D4
    description: "Shared questions, initial ids, required columns, PATHS, NEXT_STEP and validateAnswer match Python verbatim"
    requirement: "FORM-01"
    verification:
      - kind: unit
        ref: "app/worker/src/engine/parity.test.ts#contract constants"
        status: pass
    human_judgment: false
  - id: D5
    description: "Engine purity: no Hono, Supabase, fetch, Date or JS built-in max/min in engine modules"
    requirement: "FORM-01"
    verification:
      - kind: unit
        ref: "app/worker/src/engine/parity.test.ts#engine purity"
        status: pass
    human_judgment: false
  - id: D6
    description: "Freshness gate: export_golden_fixtures.py --check in pnpm check fails on stale or missing golden.json; Python oracle files unchanged and 27 unittest tests green"
    requirement: "FORM-01"
    verification:
      - kind: other
        ref: "python src/tools/export_golden_fixtures.py --check (fresh 0, edited 1, missing 1, CRLF 0)"
        status: pass
      - kind: unit
        ref: "python -m unittest discover -s src/tests (27 OK)"
        status: pass
    human_judgment: true
    rationale: "pnpm -C app check as a whole cannot exit 0 in a clean checkout because of the pre-existing @/stores/auth-store import (deferred-items.md); a verifier should confirm the full gate after that fix lands"

duration: 35min
completed: 2026-10-11
status: complete
---

# Phase 7 Plan 01: Engine Port and Golden Oracle Summary

**The Python 433-A screening engine ported 1:1 to a pure TypeScript Worker module and proven identical on 160 golden cases. A stdlib exporter records each case's standards-lookup sequence, and the TS test replays that sequence and throws on any call out of order.**

## Performance

- **Duration:** about 35 min
- **Started:** 2026-10-11T05:40:00Z (approximate)
- **Completed:** 2026-10-11T06:15:21Z
- **Tasks:** 3 (Task 2 as TDD: RED then GREEN)
- **Files modified:** 24 (20 created, 4 modified)

## Accomplishments
- `app/worker/src/engine/` holds six pure modules that mirror `src/determination.py`, `src/financial_data.py`, `src/intake_workflow.py`, `src/standards*.py` and the `_PATHS`/`_NEXT` constants of `src/case_api.py`, function for function. Every constant stays inline and cites its Python line and 433-A(OIC) line. The path and reason strings are byte-identical to Python.
- `app/shared/questions.ts` holds the 28 questions verbatim, plus the applicability rules and `validateAnswer` with Python's error message. Both the Worker and the SPA tsconfig include it.
- `src/tools/export_golden_fixtures.py` (Python 3.11.15, stdlib only) writes `golden.json`:
  - Cases: 12 existing-test, 69 `grid_*`, 15 `boundary_*`, 1 `pay_frequency_not_applicable`, 63 `null_*` (58 required columns + 5 question-only). All six paths are covered.
  - 140 validations.
  - The exporter refuses Python 3.12+ `sum()`, rejects `-0.0` and non-int values in int columns, and checks that each boundary pair lands on its named side.
- `parity.test.ts` has 270 tests, all passing with exact `toEqual`. A mutation check confirmed the suite catches real changes. Changing any of these made it fail: the public-transport rule, `Math.ceil`→`Math.round`, the legacy joint cap, the `$500` and `$50,000` comparisons, the second-vehicle exemption, and the health-care age.
- `pnpm check` now runs the freshness check. `test:live:file` is available for later plans.

## Task Commits

1. **Task 1: Python oracle → golden.json → TS engine → parity test (tracer)**: `b80552e` (feat)
2. **Task 2 RED: failing parity tests for grid, nulls, breakdown, NRE, contract, purity**: `2b90421` (test)
3. **Task 2 GREEN: oracle grid, boundaries, nulls, breakdown and NRE lines**: `b94ce41` (feat)
4. **Task 3: freshness gate in pnpm check, test:live:file**: `565034b` (chore)

## Files Created/Modified
- `src/tools/export_golden_fixtures.py`: the oracle exporter, with a recorder, the grid, coverage checks and `--check`.
- `app/worker/test/fixtures/engine/golden.json`: generated fixtures. Do not hand-edit.
- `app/shared/questions.ts`: the 28 questions, applicability rules and validation.
- `app/worker/src/engine/py.ts`: `pyMax`, `pyMin`, `sumInOrder`.
- `app/worker/src/engine/financial-data.ts`: the `FinancialData` shape, required columns, `MissingFactError` and row conversion.
- `app/worker/src/engine/standards.ts`: the sync `StandardsRepository`, its facade and `StandardsLookupError`.
- `app/worker/src/engine/determination.ts`: the math, `ALLOWABLE_KEYS`, the NRE lines and labels, and the decision tree.
- `app/worker/src/engine/intake-workflow.ts`: missing facts, document requests, review flags and `evaluateCase`.
- `app/worker/src/engine/outcome.ts`: `PATHS`, `NEXT_STEP`, `outcomeFor` and `ENGINE_VERSION = 'ts-port-1'`.
- `app/worker/src/engine/parity.test.ts`: the parity, coverage, contract and purity tests.
- `app/package.json`: the `check` freshness step and `test:live:file`.
- `app/worker/tsconfig.json`, `app/tsconfig.app.json`: both now include `shared`.
- Companion docs for every code file under `docs/`, mirroring the path. `docs/app/README.md` scripts are updated.

## Decisions Made
- One exporter file (424 lines < 500). No `golden_cases.py`.
- Breakdown parity uses the strict replay of the main sequence, not the lenient lookup the plan suggested. This is stronger, and the exporter proves the two sequences are identical.
- No port detail needed a helper beyond `py.ts`. Python truthiness was ported inline: `Boolean`-style `if`, `=== true`/`=== false`, `== null`, `new Set` first-occurrence dedupe, and the default `.sort()`.
- `python` in `golden.json` is `3.11` (major.minor), so a patch upgrade does not flag the fixture as stale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing coverage] Grid gained a public-transport expense on vehicle rows and a one-vehicle legacy joint-offer row**
- **Found during:** Task 2 (mutation check after GREEN)
- **Issue:** Changing `vehicle_count === 0` to `<= 1` for public transportation survived the suite, because no row combined vehicles with a public-transport expense. The legacy `min(vehicle_count, 2)` cap was also untested for one vehicle.
- **Fix:** Every household×vehicle grid row now carries `actual_public_transportation = 120`. Added `boundary_joint_offer_legacy_one_vehicle`.
- **Files modified:** `src/tools/export_golden_fixtures.py`, `golden.json`
- **Verification:** both mutations now fail 12 and 2 tests respectively.
- **Committed in:** `b94ce41`

**2. [Plan wording] `validations` entries also carry `error`**
- Python's `TypeError` message is stored next to `ok`, so the test checks the wording as well as accept/reject. This is additive to the planned shape.

---

**Total deviations:** 1 auto-fixed (missing coverage), 1 additive shape detail.
**Impact on plan:** Stronger parity, no scope creep.

## Issues Encountered
- **`pnpm -C app check` cannot exit 0 in this worktree (Task 3 acceptance not met as written).** At base `dbec332`, `app/src/components/sign-out-dialog.tsx` imports `@/stores/auth-store`, which was never tracked. That one import fails `tsc -b` and the `web` suite `src/routes/admin/guard.test.tsx`. It predates this plan, lies outside its files, and is logged in `deferred-items.md`. Every other stage was run and is green:
  - size gate: pass
  - `--check`: pass
  - `eslint .`: exit 0
  - `pnpm test`: 416 passed, 52 skipped; only that suite fails
- **TDD RED evidence:** the first TAP capture was rejected (`invalid_record`). Vitest's TAP reporter emits multi-line diffs that are not valid TAP, and pnpm appends a banner. I reran only the target test (`fixture coverage > holds at least 60 grid and boundary cases`) by invoking Vitest directly, which gave `RED_EVIDENCE_OK`. Semantic assessment: the target ran and failed on the planned assertion ("expected 0 to be greater than or equal to 60"), because the Task 1 fixture had no grid. No setup or import faults were involved.
- **Two mutations survive by construction.** Neither is a gap; both are recorded in `docs/app/worker/src/engine/parity.test.md`:
  - `pyMax` tie order: fixtures contain no `-0.0`.
  - The CSED clamp value: the clamped payment is used only when CSED > 0.

## TDD Gate Compliance
Task 2: the RED commit `2b90421` (test) comes before the GREEN commit `b94ce41` (feat). No refactor was needed.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- The engine modules and `app/shared/questions.ts` are ready for the evaluation route (BundleStandardsRepository), the worksheet, the staff view and client intake to import.
- Blocker for a fully green `pnpm check`: fix the `@/stores/auth-store` import (deferred-items.md).
- Any Python engine change must be followed by `python src/tools/export_golden_fixtures.py`, or `pnpm check` fails.

---
*Phase: 07-433-a-pre-population*
*Completed: 2026-10-11*

## Self-Check: PASSED

- All 10 code files, golden.json and 9 companion docs exist.
- Commits b80552e, 2b90421, b94ce41, 565034b are ancestors of HEAD.
- No stub patterns (TODO/FIXME/placeholder) in the engine, shared module or exporter.
- Verification rerun: `--check` fresh; worker engine suite 270/270; Python unittest 27 OK; `git diff --stat dbec332 -- src/` shows only `src/tools/export_golden_fixtures.py`.
