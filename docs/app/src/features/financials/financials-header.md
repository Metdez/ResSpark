# `app/src/features/financials/financials-header.tsx`

`FinancialsHeader({ caseId, view, actions? })`: the 433-A page header (D-14, FORM-04). Plan 07-12 passes its `Extract values` button through `actions`.

| Part | What it does |
|------|--------------|
| Progress | `{n} of {m} required facts confirmed`, from `view.required.confirmed` and `view.required.total` (the Worker counts them; the SPA does not). |
| Window toggle | A two-button group labelled `Statement window`: `3 months` and `6 months`, the current one `secondary` with `aria-pressed="true"`. Clicking the other one calls `useRefresh(caseId).mutate({ window_months })`, which saves the setting and queues new proposals; clicking the current one does nothing. |
| Window dates | `view.window.start` – `view.window.end` through `formatDay` (`Jul 1, 2026 – Sep 30, 2026`): the complete calendar months the bank and payroll proposals cover. |
| `Refresh proposals` | Outline button calling `refresh.mutate({})`: re-runs every proposer with the saved settings. |
| `actions` | Rendered last in the row. |

All three buttons are disabled while a refresh request is in flight.

Tested in `financials-page.test.tsx` (see `financials-page.md`).
