# `app/worker/src/engine/py.ts`

Three helpers that give the TypeScript engine Python's builtin semantics. The engine port (D-02) must produce the same last bit as `src/determination.py`, and two JavaScript defaults differ from Python in ways the golden parity test (`toEqual`) catches.

| Export | Python builtin | Why it exists |
|--------|----------------|---------------|
| `pyMax(a, b)` | `max(a, b)` | Python returns the **first** argument on a tie. The JS built-in returns `+0` for `(-0, 0)`, and Vitest `toEqual` treats `-0` and `0` as different, so a tie would fail parity. `b > a ? b : a` keeps `a` on ties. |
| `pyMin(a, b)` | `min(a, b)` | Same rule, `b < a ? b : a`. |
| `sumInOrder(values)` | `sum(values)` on Python 3.11 | Starts at `0` and adds left to right. Python 3.12+ switched `sum()` of floats to compensated (Neumaier) summation, which changes last-bit totals; `src/tools/export_golden_fixtures.py` refuses to run on such an interpreter, so fixtures and this helper always agree. |

## Rules for the engine

- Every Python `max`/`min` in the ported modules uses `pyMax`/`pyMin`. The JS built-in max/min helpers are forbidden in `engine/` (the purity block in `parity.test.ts` enforces this).
- `sumInOrder` is used only where Python calls `sum()` (the allowable-expense total). Where Python writes an explicit `a + b + …` chain (gross income, NRE total), the TS writes the same chain, because a chain starts from the first term, not from `0`.
- Switching to Python 3.12 semantics later means replacing `sumInOrder` with a Neumaier sum and regenerating the fixtures.
