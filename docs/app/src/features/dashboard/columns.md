# `app/src/features/dashboard/columns.tsx`

The TanStack Table column definitions for the dashboard (Phase 3 Plan 04, D-07, STAT-01), following UI-SPEC "Dense admin tables". The first column links to the request, there is a badge column, timestamps are right-aligned `tabular-nums` relative times with the ISO time in `title`, and row actions sit in a trailing `DropdownMenu`.

| Part | What it does |
|------|--------------|
| `TimeKey` | The three timestamp columns: `sent_at`, `opened_at`, `last_activity_at`. |
| `timeColumn(id, title)` | A sortable timestamp column. The header is the vendored `DataTableColumnHeader` (Asc/Desc menu) aligned right. The cell is `ago(value)` with the ISO value in `title`, or `—` when the value is `null`. It uses `sortingFn: 'text'`: PostgREST ISO timestamps compare chronologically as plain text, while `'alphanumeric'` would compare the fractional seconds as numbers. TanStack's `text` sort turns `null` into an empty string, so a missing time sorts last in descending order and first in ascending order. |
| Client | `row.client_name` (built once by the Worker's `clientName`) as an accent, underlined `Link` to `/admin/requests/$requestId`. Sortable. |
| Template | `template_name`. Sortable. |
| Status | `<StatusBadge {...requestStatusBadge(status)} />`, plus `<StatusBadge {...OVERDUE_BADGE} />` when the view set `overdue`. Neither the status nor the overdue flag is computed here (D-06, D-07). Sortable by the raw status. |
| Sent, Opened, Last activity | `timeColumn`. `RequestTable` sorts by `last_activity_at` descending by default. |
| Agent | `agent_display_name`, or `—`. Sortable. |
| actions | Not sortable. The header is a screen-reader-only `Actions`. The cell is a ghost icon `Button` (`MoreHorizontal`, `aria-label="Actions"`, `Tooltip` "Actions") that opens a menu with one item, `Open request`, which links to the request page. |

## Tests

`request-table.test.tsx` covers the header labels, links, badges, the `Overdue` badge only on the flagged row, `ago` text with the ISO `title`, and a sort change from the `Last activity` header menu.
