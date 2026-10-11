# `app/src/features/review/connections/connections-panel.test.tsx`

Component tests for `ConnectionsPanel` and the `ConnectionCard` it renders. `./api` is partly mocked (`fetchConnections`, `refreshConnection`, `fetchTransactions`), `sonner` is mocked, and `useQuery` is wrapped in a spy so the test can read the query options. Each test renders into a fresh `QueryClient` with retries off.

| Test | Checks |
|------|--------|
| polls with pollInterval | Query key `['connections', 'R1']`, `refetchInterval: pollInterval`, `placeholderData: keepPreviousData`. |
| skeleton rows | A never-resolving fetch shows three `[data-skeleton]` rows. |
| empty block | An empty list shows `No connections yet` in a `min-h-60` block. |
| one card per connection | Server order kept; `Bank` / `Payroll` headings; `Plaid` / `Truv` provider text. |
| mirrors server status | `Syncing (bank is sending history)` and `Transactions: 0 · Syncing` for the syncing bank; `Done` for payroll. |
| timestamps | `Last synced` and `Last webhook` spans carry the ISO time in `title`; every card has a Refresh button. |
| error code label | `ITEM_LOGIN_REQUIRED` shows `Client must reconnect` and the raw code. |
| Refresh lifecycle | Calls `refreshConnection('C1')`, shows a disabled `Refreshing…` while pending, then invalidates `['connections', 'R1']` and returns to `Refresh`. |
| 502 toast | `toast.error(GENERIC_ERROR)` once, with a muted span containing `provider_unavailable` as the description. |

Helpers: `conn(over)` builds a summary; `TWO` is a syncing bank plus a done payroll; `tick` flushes pending promises; `refreshButton(card)` finds the card's Refresh button by text.
