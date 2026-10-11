# `app/src/features/review/connections/payroll-panel.test.tsx`

Component tests for `PayrollPanel`. `../api` `documentUrl` and `sonner` are mocked, and `window.open` is stubbed.

| Test | Checks |
|------|--------|
| employers | Name, `Done` badge and joined counts for Acme; the `Employer` fallback and `Needs attention` for the errored one. |
| link labels | `Pay stub · …`, `W-2 · …`, `Income report · …`, `1099 · …`. |
| open | Clicking the first link calls `documentUrl('P1', 'inline')` and `window.open(url, '_blank', 'noopener')`. |
| zero documents | `No documents yet` and no buttons. |
| no employers | `No employers yet`. |
