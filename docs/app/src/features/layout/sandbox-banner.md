# `app/src/features/layout/sandbox-banner.tsx`

The amber SANDBOX strip at the top of every `/admin` page (D-19, PLAT-05, UI-SPEC S1/S2). It is display only. The server-side `logicsWriteGuard` is what actually blocks Logics writes.

| Lines | What it does |
|-------|--------------|
| 1-2 | TanStack Query plus `api`/`isConfig` from `lib/api.ts`. |
| 4-9 | `MODE_TEXT` (Phase 5 D-10): `fake` → `Logics writes simulated`; `live` → `Test environment — Logics writes go to allowlisted test cases only`. |
| 11 | The fail-safe rule: the banner shows while loading and on error, and hides only when the server proves the environment is production. |
| 12-18 | Reads `GET /api/config` under the query key `['config']`, retries once, and keeps the answer fresh for 60 s so navigation does not refetch. |
| 19 | Returns `null` only when `app_env === 'production'`. |
| 20-30 | `role="status"` strip, `data-slot="sandbox-banner"` (the hook the shell-offset CSS uses), `sticky top-0 z-50`, at least 36 px tall (`min-h-9`), full width, `bg-warning`/`text-warning-foreground` tokens, centered 14 px text. It shows **SANDBOX** (600), then, once `/api/config` has answered, an `aria-hidden` `·` and the mode text, so it reads `SANDBOX · Logics writes simulated` in fake mode. While the config is loading or failed (or `logics_mode` is anything other than `fake`/`live`, which fails `isConfig`), the text is Phase 1's fail-safe sentence `Test environment — nothing here is sent to IRS Logics.` (400). |

## Notes

- Why the wording changed (Phase 5 D-10): once pushes exist, "nothing here is sent to IRS Logics" is wrong in live mode and too vague in fake mode. Andrew must always see whether a push was simulated. Phase 1's sentence is kept as the loading/error default because it is still the safe claim when the mode is unknown.

- There is no close button, no local state, and no persistence. Hiding the warning must not be possible.
- `min-h-9` instead of `h-9` lets the copy wrap to two lines on narrow screens rather than truncating.
- `styles/index.css` pushes the fixed sidebar and the sticky `.header-fixed` header 2.25 rem down whenever the banner is in the DOM, so the banner does not cover them. The offset assumes one line; when the copy wraps on a narrow phone, the banner (z-50) overlaps the top of the sticky header by about one text line.

## Tests

- `sandbox-banner.test.tsx` (co-located, `web` project; `createRoot` + `act`, `fetch` stubbed, `@/lib/supabase` mocked):
  - `sandbox` + `fake`: `SANDBOX` and `Logics writes simulated`, with no `<button>`;
  - `sandbox` + `live`: the allowlist sentence;
  - an unknown `logics_mode`: the fail-safe sentence;
  - present while the fetch is pending;
  - present when the fetch rejects;
  - absent for `production`.
- Written RED first (the stub returned `null`), then GREEN.
