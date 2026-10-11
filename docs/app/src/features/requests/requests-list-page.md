# `app/src/features/requests/requests-list-page.tsx`

`RequestsListPage()`: the `/admin/requests` content (REQ-03 follow-through). Every request the firm has created, newest first, as a UI-SPEC dense admin table, with the Inherited empty and loading states. Filters, sorting controls, overdue flags, and polling are Phase 3 (STAT-01/02) and are deliberately absent.

| Part | What it does |
|------|--------------|
| `RTF`, `UNITS` | One `Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })` and the unit table (year = 365 days, month = 30 days, day, hour, minute, second). |
| `relativeTime(iso, now?)` | Picks the largest unit the difference reaches and rounds: `30 seconds ago`, `2 hours ago`, `yesterday`, `in 13 days`, `2 months ago`. `now` is injectable for tests. Lives here because this table is its only caller. |
| `COLUMNS`, `HEAD`, `CELL` | Column labels `Client`, `Status`, `Sent`, `Expires`; header cells are sticky, `bg-muted`, 600 weight, `px-3 py-2`; body cells `px-3 py-2`. |
| `Time` | A relative time with the ISO timestamp in `title`, or `—` when the value is `null` (a draft has no sent time or link). |
| `Rows` | One 40 px row per request with `hover:bg-muted/50`: the client name as an accent, underlined TanStack `Link` to `/admin/requests/$requestId`, the request `StatusBadge`, then `Sent` and `Expires`. |
| `SkeletonRows` | Three rows of `Skeleton` bars in the same four columns while the query is pending. |
| `Empty` | The Inherited empty block inside a `Card` (`min-h-60`): 48 px muted `Inbox`, Heading `Nothing to do yet`, the dashboard body copy, and the single CTA `Find a client` (`Button asChild` around a `Link` to `/admin/lookup`). |
| `RequestsListPage` | `useQuery(['requests'], listRequests)` with `meta: { errorShown: true }`. Display title `Requests`, then: a destructive `Alert` (`Couldn't load requests` + the generic staff copy) on error; `Empty` for zero rows; otherwise the `Table` (14 px) with a count-aware `TableCaption` (`1 request`, `12 requests`) once data exists, the header, and either `Rows` or `SkeletonRows`. |

## Notes

- The Worker returns at most 200 requests (`listRequests` in `worker/src/db/requests.ts`); paging is not needed for the demo.
- `meta.errorShown` tells the app-wide handler in `main.tsx` that this page shows its own error, so a failed load gets no extra toast. A 401 still signs out (Plan 02-08).

## Tests

`requests-list-page.test.tsx` (`web` project; rendered inside a minimal TanStack memory router because the page uses `Link`; `fetch` stubbed through `test-utils/query-render`), 7 cases:

- two rows: header `Client`/`Status`/`Sent`/`Expires`, rows in the returned order, the first cell a link to `/admin/requests/r2`, badges `Sent` and `Opened`, caption `2 requests`;
- relative `Sent` (`2 hours ago`, ISO in `title`) and `Expires` (`in 13 days`);
- one row gives `1 request`;
- `null` times render `—`;
- zero rows render the empty block, its body copy, and exactly one link, `Find a client` to `/admin/lookup`;
- pending renders three skeleton rows;
- `relativeTime` picks seconds, minutes, `yesterday`, days, and months.
