# `app/worker/src/engine/parity.test.ts`

The proof that the TypeScript engine equals the Python oracle (D-03, FORM-01). Runs in the Vitest `worker-node` project (`pnpm -C app exec vitest run --project worker-node worker/src/engine/parity.test.ts`). Needs no network and no database.

## Parts

| Part | What it does |
|------|--------------|
| `GoldenCall`, `GoldenCase`, `Golden` | The shape of `app/worker/test/fixtures/engine/golden.json`, written by `src/tools/export_golden_fixtures.py`. |
| `golden` | Reads the fixture through `fileURLToPath(new URL('../../test/fixtures/engine/golden.json', import.meta.url).href)` (`.href` because the Workers and Node URL types clash under `tsc`, as in `rls.test.ts`). |
| `caseNamed(name)` | Finds a fixture case or fails loudly. |
| `replay(calls)` | A `StandardsRepository` that maps each method to its Python name, shifts the next recorded call, and throws `unexpected standards call …` unless method and arguments match exactly; it returns the recorded value. `remaining()` reports unconsumed calls. A reordered, extra or missing lookup therefore fails the test. |
| `golden parity with the Python oracle` | For every case: `evaluateCase(row, replay)` must `toEqual` the expected status, missing question ids, missing financial fields, review flags, document requests and determination, and the replay queue must be empty. Plus: a complete row with a `null` repository throws Python's message, and the replay fake rejects an unexpected call. |
| `question contract` | `QUESTIONS` has 28 entries whose ids, prompts and types equal `golden.questions` in order. |

## Rules

- Exact equality only (`toEqual`, never `toBeCloseTo`): a last-bit difference is a real drift.
- A failure is fixed in the TypeScript port, never in Python and never by loosening the assertion.
