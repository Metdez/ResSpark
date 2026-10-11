# `app/worker/src/engine/py.ts`

Five helpers that give the TypeScript engine Python's builtin semantics. The engine port (D-02) must produce the same last bit as `src/determination.py`, and two JavaScript defaults differ from Python in ways the golden parity test (`toEqual`) catches.

| Export | Python builtin | Why it exists |
|--------|----------------|---------------|
| `pyMax(a, b)` | `max(a, b)` | Python returns the **first** argument on a tie. The JS built-in returns `+0` for `(-0, 0)`, and Vitest `toEqual` treats `-0` and `0` as different, so a tie would fail parity. `b > a ? b : a` keeps `a` on ties. |
| `pyMin(a, b)` | `min(a, b)` | Same rule, `b < a ? b : a`. |
| `sumInOrder(values)` | `sum(values)` on Python 3.11 | Starts at `0` and adds left to right. Python 3.12+ switched `sum()` of floats to compensated (Neumaier) summation, which changes last-bit totals; `src/tools/export_golden_fixtures.py` refuses to run on such an interpreter, so fixtures and this helper always agree. |
| `pyFixed(x, digits)` | `f"{x:,.{digits}f}"` | Python's money formatting in the decision-check text. `toFixed` already rounds the exact binary value correctly, but it breaks an exact tie upward, while Python rounds it to even (`0.125` → `0.12`, `2.5` → `2`). The helper reads the double's exact decimal expansion (`toFixed(100)`); when the digits after the cut are exactly `5000…`, it keeps the truncated value if its last digit is even. It then adds thousands commas and the sign, and prints `-0.00` for `-0` as Python does. A value that only looks like a tie, such as `0.005`, which is really slightly above it, is left to `toFixed` and gives `0.01`, as in Python. |
| `wholeDollars(amount)` | `_whole_dollars`: `int(Decimal(str(x)).quantize(Decimal("1"), ROUND_HALF_UP))` | Rounds the lump-sum and periodic OIC minimums to whole dollars, half away from zero, on the shortest printed digits. JS `String(x)` and Python `str(x)` print the same shortest round-trip digits, so the helper rounds from the first fractional digit of that string. A negative result that rounds to 0 returns `0`, not `-0`, as Python's `int` does. Shortcut: a number printed with an exponent is either below `1e-6` (returns 0) or at least `1e21` (already whole). |

## Rules for the engine

- Every Python `max`/`min` in the ported modules uses `pyMax`/`pyMin`. The JS built-in max/min helpers are forbidden in `engine/` (the purity block in `parity.test.ts` enforces this).
- `sumInOrder` is used only where Python calls `sum()` (the allowable-expense total). Where Python writes an explicit `a + b + …` chain (gross income, NRE total), the TS writes the same chain, because a chain starts from the first term, not from `0`.
- Switching to Python 3.12 semantics later means replacing `sumInOrder` with a Neumaier sum and regenerating the fixtures.
