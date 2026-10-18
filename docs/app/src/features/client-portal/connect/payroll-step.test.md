# `app/src/features/client-portal/connect/payroll-step.test.tsx`

Renders `PayrollStep` (step `I1`, firm `ValorTax`) with `./connection-api`, `./use-truv-bridge`, `sonner`, and `UploadSheet` mocked through `vi.hoisted` mocks (`m`).

- `@/features/uploads/api` (`listItemDocuments`) is mocked too, for the rejection note.
- `render(data, step?)` resolves `getItemConnection` with `data` and waits for the message paragraph (`data-connect-message`).
- `beforeEach` makes consent and reconcile resolve, `startConnection` return `{ connection_id: 'C1', bridge_token: 'bt_1' }`, and Bridge `init` return `{ open }`.
- `conn()` and `view()` build `ItemConnection` fixtures.

1. Fresh: a 44 px `Connect payroll`, the upload button, and a `[data-provider-mark]` reading "Secure connection powered by Truv" (until the Oct 12 2026 call this test asserted that no vendor name appeared; the client asked for the opposite).
2. Connect opens the consent sheet (its title) and does not load Bridge.
3. `I agree` calls consent, start, load, `init({ isOrder: true, bridgeToken: 'bt_1' })`, and `open`, in that order (`invocationCallOrder`).
4. With the captured `init` options: a bridge `SUCCESS` does not reconcile; an order `COMPLETED` reconciles `C1` once; `onClose` reconciles again.
5. Already consented: Connect goes straight to Bridge and never shows or records consent.
6. `provider_not_configured` from start shows the not-configured sentence and removes `Connect payroll`; the upload button stays.
7. A Bridge load failure toasts the payroll-window sentence.
8. `pending`: "Finishing up…" and a 44 px `Add another employer`.
9. `done` with two employers: both names, `2 pay stubs · 1 W-2`, `1 pay stub` with no W-2 part, and the done sentence, and a 44 px `Add another employer` (a second job can still be connected after the first is done).
10. `error` / `order_expired`: the expired sentence and no Bridge load.
11. `Upload pay stubs instead` renders the mocked `UploadSheet` with item id `I1`.
12. A second order (follow-up fix 2026-10-11): a merged `done` view with Acme `done` and Beta `pending` shows two employer rows, Acme, a `Waiting` chip, no "Finishing up…", and both `Add another employer` and the upload button.
13. `itemConnectionQuery`'s `refetchInterval` is 5 000 for `pending`, `false` for `done`, 5 000 for `done` with a pending employer, `false` for `error` with one, and `false` when the sheet is closed.

## Polish (Task 3)

14. A `rejected` step whose `rejection_note` is "The W-2 was cut off." shows "Your agent asked for a new copy: The W-2 was cut off."; the upload button comes before `Connect payroll` and is filled (`bg-primary`), and the connect button is outline (`bg-background`).
15. A start failure with `consent_text_stale` reopens the consent sheet with "Please read and agree again.", shows no toast, refetches the connection, and a second `I agree` records consent and opens Bridge.
16. A network failure (`TypeError`) shows exactly one `toast.error("Something went wrong. Try again.")` and no `role="alert"`.
17. Every button in the sheet (except the hidden vendored icon close, the dialog's last child) is 44 px.
