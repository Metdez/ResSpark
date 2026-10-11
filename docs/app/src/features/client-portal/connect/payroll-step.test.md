# `app/src/features/client-portal/connect/payroll-step.test.tsx`

Renders `PayrollStep` (step `I1`, firm `ValorTax`) with `./connection-api`, `./use-truv-bridge`, `sonner`, and `UploadSheet` mocked through `vi.hoisted` mocks (`m`).

- `render(data)` resolves `getItemConnection` with `data` and waits for the message paragraph (`data-connect-message`).
- `beforeEach` makes consent and reconcile resolve, `startConnection` return `{ connection_id: 'C1', bridge_token: 'bt_1' }`, and Bridge `init` return `{ open }`.
- `conn()` and `view()` build `ItemConnection` fixtures.

1. Fresh: a 44 px `Connect payroll`, the upload button, and no vendor name in the page.
2. Connect opens the consent sheet (its title) and does not load Bridge.
3. `I agree` calls consent, start, load, `init({ isOrder: true, bridgeToken: 'bt_1' })`, and `open`, in that order (`invocationCallOrder`).
4. With the captured `init` options: a bridge `SUCCESS` does not reconcile; an order `COMPLETED` reconciles `C1` once; `onClose` reconciles again.
5. Already consented: Connect goes straight to Bridge and never shows or records consent.
6. `provider_not_configured` from start shows the not-configured sentence and removes `Connect payroll`; the upload button stays.
7. A Bridge load failure toasts the payroll-window sentence.
8. `pending`: "Finishing up…" and a 44 px `Add another employer`.
9. `done` with two employers: both names, `2 pay stubs · 1 W-2`, `1 pay stub` with no W-2 part, and the done sentence.
10. `error` / `order_expired`: the expired sentence and no Bridge load.
11. `Upload pay stubs instead` renders the mocked `UploadSheet` with item id `I1`.
12. `itemConnectionQuery`'s `refetchInterval` is 5 000 for `pending`, `false` for `done`, and `false` when the sheet is closed.
