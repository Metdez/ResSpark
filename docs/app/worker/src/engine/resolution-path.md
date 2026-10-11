# `app/worker/src/engine/resolution-path.ts`

A line-for-line port of STEP 6 of `src/determination.py`: the `Determination` record and `determine_resolution_path`, the decision tree, including the Offer in Compromise path and the calculation trace. It uses the step 1-5 functions in `determination.ts` and the trace helpers in `trace.ts`. It is pure, like the rest of the engine, and `parity.test.ts` compares every result, including the whole trace, with `golden.json`.

**Never change a path, reason, check text, threshold or rounding rule here without changing Python first**, then regenerating the fixtures.

## Parts

| Part | Python source | What it does |
|------|---------------|--------------|
| `Determination` | `@dataclass Determination` (:213-223) | `path`, `reason`, the four figures, `suggested_offer_or_payment`, `needs_manual_review`, `review_notes`, and `calculation_trace` (the six `TraceSection`s). |
| `determineResolutionPath(fd, repo)` | `determine_resolution_path` (:299-447) | See below. |

## `determineResolutionPath`, step by step

1. **Figures.** Gross income; allowable expenses with an expense-trace array; `rawNdi = income - expenses`; NRE with an equity-trace array; the compliance gate. `ndi` is the raw value when the gate fails and `pyMax(rawNdi, 0)` otherwise, so a blocked case reports a negative NDI and every other case is clamped at 0.
2. **Amounts.** `csedMonths = pyMax(csed_months_remaining, 1)`. `csedPayment = Math.ceil((owed / csedMonths) * 100) / 100` is the full-pay monthly amount rounded up to the cent. `lumpSum = wholeDollars(nre + pyMax(rawNdi, 0) * 12)` and `periodic = wholeDollars(nre + … * 24)` are the Form 656-B minimum offers (equity plus 12 or 24 months of remaining income) in whole dollars, rounded half up.
3. **Selection.** These rules are checked in order and the first match wins:
   - 0, compliance block: the gate failed.
   - 1, CNC: NDI ≤ 0 and NRE ≤ $500.
   - 2, manual equity review: NDI ≤ 0 and NRE > $500.
   - 3, Simple Payment Plan: CSED > 0, owed ≤ $50,000 and NDI ≥ the full-pay payment.
   - 4, Non-Simple Installment Agreement: CSED > 0 and NDI ≥ the full-pay payment.
   - 5, Offer in Compromise: `0 < lumpSum < owed`.
   - 6, manual payment review: none of the above.
4. **Decision checks.** There is one check for each of the seven rules, with Python's label and detail text. Money in the details is formatted by `pyFixed` exactly like Python's `f"{x:,.2f}"`; the lump sum uses `,.0f`. Each check's status depends on where it sits relative to the selected rule:
   - a check after the selected rule is `not_evaluated`;
   - the selected rule is `matched`;
   - the compliance gate before the selected rule is `pass`;
   - any other check before the selected rule is `fail`.
5. **`result(path, reason, suggested, manual, notes)`.** Builds the trace with `buildTrace` from copies of the expense and equity steps. It then inserts a `resolution_amounts` section at index 4, with four steps: the full-pay requirement, the lump-sum minimum, the periodic minimum and the selected amount. It returns the `Determination`; `review_notes` is `notes`, or `[]` when there are none (Python `notes or []`).
6. **Paths.** These are the seven verbatim path/reason pairs. The strings are double-quoted so a search for the Python literal finds them.
   - **Blocked:** suggested amount 0; needs manual review; the notes are the gate reasons.
   - **CNC:** suggested amount 0.
   - **Manual equity review:** suggested amount is the NRE; needs manual review; the note is "Equity-funded OIC vs. CNC judgment call — see IRM 5.8.5."
   - **Simple plan:** suggested amount is the full-pay payment.
   - **Non-simple installment agreement:** suggested amount is the full-pay payment.
   - **Offer in Compromise:** suggested amount is the lump sum; the note is "The 6-to-24-month minimum offer is $N."
   - **Manual payment review:** suggested amount 0; needs manual review.

## Rules

- `wholeDollars` and `pyFixed` (in `py.ts`) reproduce Python's `Decimal` rounding and format rounding. Do not replace them with `Math.round` or `toFixed`. Both differ from Python on halves, and the `boundary_lump_sum_half_dollar` fixture catches the change.
- No JS built-in max/min, no `Date`, no `fetch`, no Hono/Supabase import (purity block in `parity.test.ts`).
