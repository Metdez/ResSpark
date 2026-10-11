# `app/src/features/dashboard/request-table.tsx`

`RequestTable()` is the live request list on `/admin` (Phase 3 Plan 04, D-07, D-08, STAT-01, STAT-02). It is a TanStack Table over `useRequests`, with the UI-SPEC loading, empty and error states.

| Part | What it does |
|------|--------------|
| `HEAD`, `CELL` | Header cells are sticky, `bg-muted`, weight 600, `px-3 py-2`. Body cells are `px-3 py-2`. |
| `NO_ROWS` | A stable empty array for `useReactTable` while there is no data, so the table does not see a new array on every render. |
| `Empty({ q, status })` | The UI-SPEC empty block in a `Card` (`min-h-60`, 48 px muted `Inbox`, heading, body, at most one CTA). With no filter it shows `No requests yet` / `Send a client a link to see it here.` / CTA `Look up a client` → `/admin/lookup`. With a search it shows `No requests match "<q>"` and no CTA. With only a status chip it shows `No requests are <status label in lower case>` and no CTA. Both filtered variants add `Try another filter or search.` |
| `RequestTable` | Reads `?status=&q=` with `useSearch({ from: '/admin/_shell/' })` and passes it to `useRequests`. Sorting state starts at `last_activity_at` descending. TanStack's sort is stable, so the server's `id DESC` tiebreak survives. `useReactTable` uses `getCoreRowModel`, `getSortedRowModel`, row ids from `row.id`, and no column hiding. |
| First load failed | When the query is in error and has no data: a destructive `Alert` with `Couldn't load requests.` / `Check your connection and try again.` and an outline `Retry` button that calls `refetch()`. |
| Count line | Above the table, `1 request` or `N requests` (UI-SPEC zero/one/many) once rows exist. When a poll fails while rows are shown, it adds a `role="status"` notice `Couldn't refresh — retrying`. The rows stay, and `pollInterval` backs off to 30 s until the next success. |
| Table | Inside a bordered, horizontally scrolling container: the header group from the column defs, then either the sorted rows (40 px, `hover:bg-muted/50`) or, while pending with no data, exactly 3 `Skeleton` rows in the same columns. |

## States at a glance

| Query state | Shows |
|-------------|-------|
| pending, no data | header + 3 skeleton rows |
| error, no data | destructive alert + Retry |
| error, previous data | rows + `Couldn't refresh — retrying` |
| success, 0 rows | `Empty` (copy depends on the filter) |
| success, rows | count line + sorted table |

During a filter change or a poll, `keepPreviousData` keeps the old rows on screen, so the skeleton appears only on the very first load.

## Tests

`request-table.test.tsx` mocks `useRequests`, `useNavigate` and `useSearch` and renders `Filters` + `RequestTable` inside a memory router:

- Pending: 8 header cells and exactly 3 skeleton rows.
- Zero rows with no filter: `No requests yet` and a `Look up a client` link to `/admin/lookup`. With `q: 'zed'`: `No requests match "zed"` and no CTA.
- Two rows: header labels, client links to `/admin/requests/<id>`, badge labels from `requestStatusBadge`, `Overdue` only on the flagged row, `ago` text with the ISO `title`, and `2 requests`. One row: `1 request`.
- Chips, chip navigation, and the 300 ms search debounce (see `filters.md`).
- Choosing `Asc` in the `Last activity` header menu puts the older row first.
- Error with previous data keeps the row and shows `Couldn't refresh — retrying`. Error with no data shows the alert, and `Retry` calls `refetch`.
