# `app/src/features/review/connections/statement-grid.tsx`

The accounts × 6 months statement grid on a bank connection card (Plan 04-06; D-10, BANK-02, BANK-03).

## Columns: why six, why split, why not the current month

The firm pulls six months of statements so it can choose; a standard resolution packet uses the last three (PROJECT.md). Columns come from `targetMonths(now, 6)` in `lib/statement-months.ts`, the same function the Worker uses to build each account's `months`. That keeps both sides on the same window and the same order: newest first, in UTC. The window starts with the month **before** `now`, because the current month has no closed statement yet. On 10 Oct 2026 the columns are Sep, Aug, Jul 2026 (`Last 3 months`), then Jun, May, Apr 2026 (`Months 4–6`).

The header has two rows. The first row holds `Account` (spanning both rows) and two group cells, `Last 3 months` and `Months 4–6`, each `colSpan={3}`. The second row holds the six `monthLabel(year, month)` labels. A left border separates the two groups, so the standard three months read at a glance.

## Rows and cells

| Part | What it does |
|------|--------------|
| Empty | No accounts gives `No accounts yet`. |
| Row | One per account, in the order the server sent (mask, then id). The label is `name ?? 'Account'` plus ` ••{mask}` when a mask exists. `data-account` holds the id. |
| `Cell` | Looks the month up in `account.months`; a month that is absent renders as `missing`. The badge is `cellBadge(status)` via the Phase 3 `StatusBadge`. Only `available` (bank-issued `Statement`) and `manual` (`Uploaded`) cells with a `document_id` are clickable. Each is a ghost button wrapping the badge, with `aria-label` `Open {Mon YYYY} statement` or `Open {Mon YYYY} upload`, calling `openSigned(documentUrl(id, 'inline'))`. `missing`, `not_supported` and `pending` are plain badges. Uploads are never labelled as statements (PITFALLS C6). |
| `LEGEND` | A row of the five cell badges under the table, so staff can decode the colours. |

The shadcn `Table` container scrolls horizontally, so the grid stays usable on a phone. `now` is a prop so tests can pin the window.
