# `app/src/features/layout/sandbox-banner.tsx`

The amber SANDBOX strip at the top of every `/admin` page (D-19, PLAT-05, UI-SPEC S1/S2). It is display only. The server-side `logicsWriteGuard` is what actually blocks Logics writes.

| Lines | What it does |
|-------|--------------|
| 1-2 | TanStack Query plus `api`/`isConfig` from `lib/api.ts`. |
| 4 | The fail-safe rule: the banner shows while loading and on error, and hides only when the server proves the environment is production. |
| 6-11 | Reads `GET /api/config` under the query key `['config']`, retries once, and keeps the answer fresh for 60 s so navigation does not refetch. |
| 12 | Returns `null` only when `app_env === 'production'`. |
| 13-22 | `role="status"` strip, `data-slot="sandbox-banner"` (the hook the shell-offset CSS uses), `sticky top-0 z-50`, at least 36 px tall (`min-h-9`), full width, `bg-warning`/`text-warning-foreground` tokens, centered 14 px text. It shows **SANDBOX** (600) and then the fixed copy `Test environment — nothing here is sent to IRS Logics.` (400). |

## Notes

- There is no close button, no local state, and no persistence. Hiding the warning must not be possible.
- `min-h-9` instead of `h-9` lets the copy wrap to two lines on narrow screens rather than truncating.
- `styles/index.css` pushes the fixed sidebar and the sticky `.header-fixed` header 2.25 rem down whenever the banner is in the DOM, so the banner does not cover them. The offset assumes one line; when the copy wraps on a narrow phone, the banner (z-50) overlaps the top of the sticky header by about one text line.

## Tests

- `sandbox-banner.test.tsx` (co-located, `web` project; `createRoot` + `act`, `fetch` stubbed, `@/lib/supabase` mocked):
  - present for `sandbox`, with no `<button>`;
  - present while the fetch is pending;
  - present when the fetch rejects;
  - absent for `production`.
- Written RED first (the stub returned `null`), then GREEN.
