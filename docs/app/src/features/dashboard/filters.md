# `app/src/features/dashboard/filters.tsx`

The dashboard's filter row: status chips and a debounced search box (Phase 3 Plan 04, D-07, STAT-01). Both write to the URL search params of `/admin`, so a reload or a shared link keeps the filter.

| Part | What it does |
|------|--------------|
| `STATUS_CHIPS` | `All`, then one chip per `DASHBOARD_STATUSES` value. Each label comes from `requestStatusBadge(value).label`, so the chip text always matches the badge text in the table: `Sent`, `Opened`, `In progress`, `Waiting on staff`, `Complete`, `Revoked`. Its only consumer is this file. |
| `Filters` | Reads `status` and `q` with `useSearch({ from: '/admin/_shell/' })` and gets a `navigate` bound to the same route. |
| `text`, `timer` | The search box's local text, seeded from `q`, and the pending debounce timer. The timer is cleared on unmount. A `shortcut:` comment notes that the box is not re-synced when `q` changes through back/forward. |
| `onSearch` | Updates the box immediately and, after 300 ms without typing, writes `q` (trimmed; empty removes it) with `replace: true`, so typing does not fill the history. |
| Chip row | One `Button size="sm"` per chip. The active chip is `variant="secondary"` and has `aria-pressed="true"`, and the others are `outline` with `aria-pressed="false"`. Clicking a chip keeps `q` and sets `status`. `All` removes `status`, and the Worker then returns every non-draft request. |
| Search `Input` | `type="search"`, labelled and placeholdered `Search name or email`, at most 64 characters (the Worker's cap), full width on small screens and 256 px from `sm` up, pushed to the right. |

## Tests

`request-table.test.tsx` renders `Filters` with the table:

- The chips appear in the order above, and the active one is pressed.
- Clicking `Complete` keeps `q` and sets `status: 'complete'`. Clicking `All` clears `status`.
- Typing `ann` calls `navigate` only after 300 ms (fake timers), with `q: 'ann'` and the existing `status` kept.
