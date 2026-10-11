# `app/src/features/financials/test-fixtures.ts`

Shared data for the `features/financials` web tests. Imported only by `*.test.ts(x)` files, so it never reaches the production bundle.

| Part | What it does |
|------|--------------|
| `proposal(id, source, value)` | A `ProposalView` with a July-September 2026 window and reliability `A`. |
| `line(over)` | A `LineView` defaulting to a required, unknown (`needs_data`) money line in the income section; `over` replaces any field. |
| `confirmed(source, by_name?)` (private) | A `confirmed` block for a decided line. |
| `P1`, `P2`, `P3` | Proposal UUIDs (the decide route accepts only UUID proposal ids). |
| `makeView(over?)` | A `FinancialsView` for case `C1` (Jordan Rivera) with the seven sections in D-14 order: household (not married, does not own, spouse age and rents home unknown), employment (wage earner, pay frequency unknown), income (two competing wage proposals, Plaid $1,500 and Intake $1,400; one single interest proposal; a known $0 pension), expenses (standard-only line 36 and an edited housing line 37), assets (unknown cash), compliance and liability. The county waits for an address, there are no employers, and `12 of 64` required facts are confirmed. `over` patches lines by column. |
| `RUN` | A simple-payment-plan `RunView`: Box D $5,200, E $4,100.25, F $1,099.75, seven NRE lines (labels as the engine writes them, total $2,500), suggested amount $1,234.57 with payment math $12,345.67 over 10 months, Los Angeles CA standards for a household of 2, effective 2026-06-29, and one review flag. Every number is fixture data, not a calculation. |
