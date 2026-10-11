# `app/src/features/dashboard/index.tsx`

The `/admin` page: header controls and the Phase 1 empty state (UI-SPEC S3, A-7). Replaces the fork's
metrics/overview/recent-sales dashboard; `recharts` is no longer imported anywhere.

| Lines | What it does |
|-------|--------------|
| 1-9 | TanStack `Link`, Lucide `Inbox`, `Button`, `Card`/`CardContent`, the shell `Header` and `Main`, and the header controls (`Search`, `ThemeSwitch`, `ProfileDropdown`). |
| 11-18 | `Header` with search pushed left (`me-auto`), then theme switch and profile menu. |
| 20-21 | `Main` and the Display title `Dashboard` (24 px / 600). |
| 22-36 | One `Card` whose content is a centered block `min-h-60 py-12`: 48 px muted `Inbox` icon, Heading `Nothing to do yet` (20 px / 600), Body copy from the UI-SPEC Copywriting Contract, and the one permitted CTA `Find a client` (`Button asChild` around a `Link` to `/admin/lookup`, Plan 02-06; UI-SPEC A-7's condition is met now that the action exists). |

## Notes

- No data fetch, so no skeleton and no error surface (UI Considerations: dashboard loading/error). Phase 3 (STAT-01) replaces the empty block with the request list.
