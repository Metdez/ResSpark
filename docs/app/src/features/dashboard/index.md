# `app/src/features/dashboard/index.tsx`

The `/admin` page: header controls and the Phase 1 empty state (UI-SPEC S3, A-7). Replaces the fork's
metrics/overview/recent-sales dashboard; `recharts` is no longer imported anywhere.

| Lines | What it does |
|-------|--------------|
| 1-7 | Lucide `Inbox`, `Card`/`CardContent`, the shell `Header` and `Main`, and the header controls (`Search`, `ThemeSwitch`, `ProfileDropdown`). |
| 9-16 | `Header` with search pushed left (`me-auto`), then theme switch and profile menu. |
| 18-19 | `Main` and the Display title `Dashboard` (24 px / 600). |
| 20-31 | One `Card` whose content is a centered block `min-h-60 py-12`: 48 px muted `Inbox` icon, Heading `Nothing to do yet` (20 px / 600), Body copy from the UI-SPEC Copywriting Contract, no CTA. |

## Notes

- No data fetch, so no skeleton and no error surface (UI Considerations: dashboard loading/error). Phase 3 (STAT-01) replaces the empty block with the request list.
