# `app/src/features/dashboard/index.tsx`

The `/admin` page: the shell header, the page title `Requests`, the filter row and the live request table (Phase 3 Plan 04, STAT-01, STAT-02). It replaces the Phase 1 page, which showed only an empty state.

| Lines | What it does |
|-------|--------------|
| 1-7 | The shell `Header` and `Main`, the header controls (`Search`, `ThemeSwitch`, `ProfileDropdown`), and the two dashboard parts `Filters` and `RequestTable`. |
| 9-16 | `Header`: search pushed left (`me-auto`), then the theme switch and the profile menu. |
| 18-22 | `Main`, the display title `Requests` (24 px / 600), then `Filters` (status chips and search box) and `RequestTable`. |

## Notes

- The zero-requests state lives in `request-table.tsx`. It keeps the Phase 1 layout: a `Card` with `min-h-60`, a 48 px muted `Inbox` icon, a heading, one body line, and a single CTA to `/admin/lookup`. The copy follows the Plan 04 contract instead of the Phase 1 wording: `No requests yet` / `Send a client a link to see it here.` / `Look up a client`.
- The filter state is in the URL (`?status=&q=`, validated in `routes/admin/_shell/index.tsx`), so a reload keeps it.
