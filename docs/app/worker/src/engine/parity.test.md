# `app/worker/src/engine/parity.test.ts`

The proof that the TypeScript engine equals the Python oracle (D-03, FORM-01). Runs in the Vitest `worker-node` project (`pnpm -C app exec vitest run --project worker-node worker/src/engine/parity.test.ts`) and in `pnpm test`. Needs no network and no database.

## Parts

| Part | What it does |
|------|--------------|
| `GoldenCall`, `GoldenCase`, `Golden` | The shape of `app/worker/test/fixtures/engine/golden.json`, written by `src/tools/export_golden_fixtures.py`. The fixture is test data, so it is cast rather than validated. |
| `here(relative)`, `golden` | Resolve paths next to this file with `fileURLToPath(new URL(relative, import.meta.url).href)` (`.href` because the Workers and Node URL types clash under `tsc`, as in `rls.test.ts`) and read the fixture. |
| `caseNamed(name)` | Finds a fixture case or fails loudly. |
| `replay(calls)` | A `StandardsRepository` that maps each method to its Python name (`nationalAmount` ↔ `national_amount`, …), shifts the next recorded call, and throws `unexpected standards call …` unless method and arguments match exactly; it returns the recorded value. `remaining()` reports unconsumed calls. A reordered, extra or missing lookup therefore fails. |
| `complete` | The cases past `information_needed`, which carry a breakdown and NRE lines. |
| `golden parity with the Python oracle` | For every case: `evaluateCase(row, replay)` must `toEqual` the expected status, missing question ids, missing financial fields, review flags, document requests and determination (including the whole `calculation_trace`: every section, step label, formula, input, input key, result and check status), and the replay queue must be empty. Plus: a complete row with a `null` repository throws Python's message, and the replay fake rejects an unexpected call. |
| `allowable breakdown and NRE lines` | For every complete case: `calculateAllowableExpenses` (13 keys plus `total`) equals `allowable_breakdown` while replaying the same recorded calls strictly (the exporter checks the breakdown makes exactly the lookups `evaluate_case` made), and `netRealizableEquityLines` equals `nre_lines`. Cases that stop at `information_needed` carry `null` for both. |
| `fixture coverage` | Guards the fixture itself: at least 60 `grid_*`/`boundary_*` cases; a `null_<column>` case for every required column and the five question-only columns, each `information_needed` and listing its column; and `pay_frequency_not_applicable` evaluated past `information_needed`. |
| `contract constants` | `QUESTIONS` (28, ids, prompts, types in order), `INITIAL_QUESTION_IDS`, `REQUIRED_FINANCIAL_COLUMNS`, `PATHS` (as `[id, label]`), `NEXT_STEP`, and every `validations` sample (question × `true`, `1`, `2.5`, `"weekly"`, `null`): `validateAnswer` must accept exactly what Python accepts and reject with the same `TypeError` message. |
| `Python formatting helpers` | Fixed samples whose expected values were printed by Python 3.11. `pyFixed` must give the same output as `format(x, ',.2f')` and `format(x, ',.0f')`: exact ties `0.125`, `0.375`, `2.5` and `3.5` round to even, the near-tie `0.005` rounds up, negatives and `-0` keep the sign, and thousands get commas. `wholeDollars` must match `_whole_dollars`: `±2.5` rounds away from zero, `0.1 + 0.2` gives 0, `-0.3` gives `+0`, and `1e-7` gives 0. |
| `engine purity` | Reads every non-test `.ts` file in `engine/` and asserts none imports `hono` or `@supabase`, calls `fetch(`, mentions `Date`, or uses the JS built-in max/min (D-01, RESEARCH anti-patterns). Also asserts the scan saw at least six modules, so an empty directory listing cannot pass silently. Comments count too: write "the JS built-in max" rather than its name. |

## Rules

- Exact equality only (`toEqual`, never `toBeCloseTo`): a last-bit difference is a real drift.
- A failure is fixed in the TypeScript port, never in Python and never by loosening the assertion.

## Strength check (07-01)

Mutating the port (public-transport rule, `Math.ceil` → `Math.round`, the legacy joint-offer cap, the `$500` and `$50,000` comparisons, the second-vehicle exemption, the 65+ health-care age) makes this suite fail. After the re-port to the merged oracle, changing the Offer in Compromise test `lumpSum < owed` to `<=` fails `boundary_lump_sum_equals_owed`. Two mutations survive by construction: `pyMax` returning the second argument on a tie (equivalent while fixtures contain no `-0.0`) and the CSED clamp value (the clamped payment is used only when `csed_months_remaining > 0`, where the clamp never applies).
