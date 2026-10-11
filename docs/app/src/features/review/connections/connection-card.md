# `app/src/features/review/connections/connection-card.tsx`

One bank or payroll connection on the staff request page (Plan 04-06; D-04, WEBH-02, PAY-04).

| Part | What it does |
|------|--------------|
| `KIND` | Heading text: `bank` → `Bank`, `payroll` → `Payroll`. |
| `PROVIDER` | Display names `Plaid`, `Teller`, `Truv`; an unknown provider shows its raw id. |
| `Stamp` | `{label} {ago(iso)}` with the ISO time in `title` (UI-SPEC: relative time, exact time on hover). A missing time reads `—`. |
| Header row | `h3` kind, provider in muted text, and `StatusBadge` from `connectionBadge(status, error.code)`. The badge only mirrors the server. |
| `Refresh` button | Outline, small, with a `RefreshCw` icon and an `aria-label`. Calls `useRefreshConnection(requestId).mutate(id)`. While that call is pending for this card it is disabled and reads `Refreshing…`. When the call settles the hook invalidates `['connections', requestId]` and `['review', requestId]`, so the badge follows what the server re-read. |
| Refresh error | Any `ApiError` other than 401 (502 `provider_unavailable`, 503 `provider_not_available`, 409 `provider_error`) shows `toast.error(GENERIC_ERROR)` with the code in a 14 px muted span as the description (UI-SPEC Error). A 401 goes to the app-wide handler, which ends the session. |
| Meta line | `Last synced …` (`last_polled_at`) · `Last webhook …` (`last_webhook_at`), plus the raw `error.code` in muted text when the status is `error`. |
| Body (Task 1) | Bank: the `transactionsLine` (`Transactions: N · Syncing / Up to date / Not started`). Payroll: the employer names. Task 2 replaces this with the statement grid, transactions table and payroll panel. |

`data-connection` carries the connection id for tests.
