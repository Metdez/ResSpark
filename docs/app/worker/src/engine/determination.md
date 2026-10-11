# `app/worker/src/engine/determination.ts`

A line-for-line port of `src/determination.py`: Form 433-A(OIC) screening math and the resolution-path decision tree. It is pure (no I/O, no clock, no network); standards come from the injected `StandardsRepository`. Python stays the oracle: `parity.test.ts` proves every output equal to `golden.json`, which `src/tools/export_golden_fixtures.py` produces from the unchanged Python.

**Never change a constant, threshold, formula or wording here without changing Python first** (with an authoritative source and tests), then regenerating the fixtures.

## Parts, in file order

| Part | Python source | What it does |
|------|---------------|--------------|
| `calculateGrossMonthlyIncome(fd)` | `calculate_gross_monthly_income` (:23-30) | Box D: the same explicit chain of the 11 income fields, starting from the first field (not from `0`). |
| `ALLOWABLE_KEYS` | dict literal order (:48-71) | The 13 expense keys in Python's dict order. `total` is summed in this order. |
| `AllowableExpenses` | returned dict | The 13 keys plus `total`. |
| `calculateAllowableExpenses(fd, repo)` | `calculate_allowable_expenses` (:37-73) | Box E. Counts people 65+ (age 65 is the health-care split), derives people under 65 (may go negative, ported as is), looks up the transportation area only when `vehicle_count` is truthy (else `''`), then builds the object in Python key order so the standards calls happen in the same order: national (line 39, always the standard), housing (line 40, lesser of actual and standard), ownership (41), operating (42), public transportation only with no vehicle (43), health insurance actual (44), out-of-pocket health care always the standard for ages 30 and 65 (45; both lookups always happen), and the six actual-only lines (46-51 and other secured debts). `total = sumInOrder(...)` as Python `sum()`. |
| `calculateNetDisposableIncome(fd, repo)` | `calculate_net_disposable_income` (:79-83) | Box F: income minus the allowable total. |
| `NRE_LINE_KEYS`, `NreLines`, `NRE_LINE_LABELS` | — | The seven Section 3 lines in the order Python adds them, and short display labels naming each 433-A(OIC) line and its rule (reserve, ×0.8, exemption, deduction). Used by the staff view and worksheet so neither re-implements the math. |
| `netRealizableEquityLines(fd)` | `calculate_net_realizable_equity` body (:92-113) | Each term exactly as Python: cash less the $1,000 reserve (line 1); investments (2); retirement ×0.8 less loan (3); life-insurance cash value less loan (4); real property ×0.8 less loan (5); vehicles (6) — per-vehicle list when non-empty (×0.8 less that vehicle's loan, missing loans are 0, $3,450 exemption on the first vehicle and on the second when `filing_joint_offer`), otherwise the legacy totals with $3,450 per exempt vehicle (1, or 2 for a joint offer, capped at `vehicle_count`); other assets ×0.8 less loan less the $11,980 deduction (7). Every `max`/`min` is `pyMax`/`pyMin`. |
| `calculateNetRealizableEquity(fd)` | return line (:115) | `cash + investments + retirement + life_insurance + real_property + vehicles + other_assets`, the same chain as Python, from `netRealizableEquityLines`. |
| `passesComplianceGate(fd)` | `passes_compliance_gate` (:121-128) | The two Section 9 gates: unfiled returns and open bankruptcy, with Python's reason strings. Returns `[ok, reasons]`. |
| `Determination` | `@dataclass Determination` | `path`, `reason`, the four figures, `suggested_offer_or_payment`, `needs_manual_review`, `review_notes`. |
| `determineResolutionPath(fd, repo)` | `determine_resolution_path` (:147-228) | The decision tree. `figures()` reads `ndi` at call time, so the blocked result carries the raw NDI and later results the clamped one, exactly as Python. Order: compliance block → clamp NDI at 0 → CNC (NDI ≤ 0 and NRE ≤ $500) → manual equity review (NDI ≤ 0 and NRE > $500, payment = NRE) → CSED months clamped to at least 1 and `Math.ceil((owed / months) * 100) / 100` → Simple Payment Plan (CSED > 0, owed ≤ $50,000, NDI covers the payment) → Non-Simple Installment Agreement (CSED > 0, NDI covers the payment) → manual payment review. The six `path` and the `reason` strings are double-quoted so a search for the Python literal finds them; they must stay byte-identical. |

## Rules

- Constants stay inline where Python has them (`1000`, `0.8`, `3450`, `11980`, `500`, `50_000`, ages `30`/`65`, CSED clamp `1`), each with a comment naming the Python line and the form line (D-02).
- No JS built-in max/min, no `Date`, no `fetch`, no Hono/Supabase import (purity block in `parity.test.ts`).
- The engine has no OIC calculation; "OIC" appears only in the existing manual-review text.
