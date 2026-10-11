# `app/src/features/dashboard/request-table.test.tsx`

Component tests for `Filters` and `RequestTable`. They run in the `web` Vitest project (jsdom) and use the shared `renderWithQuery` harness inside a memory router.

## Setup

- `@tanstack/react-router` keeps its real exports, except `useNavigate` (a spy) and `useSearch` (returns the test's `search` object).
- `./use-requests` is mocked. `setQuery()` sets the query state each test needs (`data`, `isError`, `refetch`), so no request is made.
- `row()` builds a `DashboardRow`. `NEWER` (`Sam Lee`, `in_progress`, active 1 h ago) and `OLDER` (`Jordan Rivera`, `sent` 80 h ago, `overdue: true`) are the two fixtures.
- `afterEach` restores real timers and unmounts.

## Cases

The individual cases are listed under "Tests" in `request-table.md` and `filters.md`: the pending skeleton, the empty variants, populated rows and the count, the chips, the 300 ms debounce (fake timers), sorting from the header menu, and the two error states.
