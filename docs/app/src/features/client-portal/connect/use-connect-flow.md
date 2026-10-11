# `app/src/features/client-portal/connect/use-connect-flow.ts`

`useConnectFlow({ kind, itemId, consented, open, errorCopy? })`: the consent → start sequence shared by the payroll and bank sheets. Each sheet passes its own `open(started)`: payroll opens Bridge, bank sends the tab to the hosted link.

## Returned state and actions

- `connect()`: when `consented` is already true, runs the flow; otherwise sets `consenting` so the sheet shows `ConsentSheet`.
- `agree()`: runs the flow with a consent first.
- `cancelConsent()`: clears `consenting` ("Not now").
- `busy`: true while the flow runs. The consent button shows "Saving…"; the connect button shows a spinner and is disabled.
- `consenting`: the consent sheet should be shown.
- `notConfigured`: set after a `provider_not_configured` error, so the sheet switches to its not-configured state without waiting for a refetch.

## The flow, `run(withConsent)`

1. When `withConsent`, `recordConsent('bank_data' | 'payroll_data')`.
2. Clears `consenting`, then `startConnection(kind, itemId)`.
3. Awaits `open(result)`.
4. Any failure: `codeOf` reads the code (`PortalError.code`, else the `Error` message such as `bridge_load_failed`); `consenting` is cleared; `provider_not_configured` sets `notConfigured`; `toast.error(errorCopy(code))` shows one sentence. `errorCopy` defaults to `connectErrorCopy(code, kind)`.
5. `busy` is cleared in `finally`.

Covered by `payroll-step.test.tsx` and `bank-step.test.tsx`.
