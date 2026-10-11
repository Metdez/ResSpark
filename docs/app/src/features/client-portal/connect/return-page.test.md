# `app/src/features/client-portal/connect/return-page.test.tsx`

Renders `ReturnPage` with fake timers (`shouldAdvanceTime`, so the harness's real ticks still run) and these mocks: `getState` from `../portal-api` (the real `PortalError` is kept), `useNavigate` from `@tanstack/react-router`, and `toast.success` from `sonner`. `state(status)` builds a portal state with one `bank_connect` step; `advance(ms)` moves the clock inside `act`.

1. Shows "Checking your connection…", polls `getState` at least twice more over 6 s, and never calls `fetch` (nothing is started).
2. When a poll returns the bank step as `submitted`, navigates to `/c` with `replace: true` and toasts "Bank connected".
3. After 45 s the slow copy and a 44 px "Back to your steps" appear, polling continues, and the button navigates to `/c`.
4. A 401 shows "This link isn't active" and polling stops.
