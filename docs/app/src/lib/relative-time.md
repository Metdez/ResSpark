# `app/src/lib/relative-time.ts`

The only relative-time formatter in the admin app (UI-SPEC "Dense admin tables": relative times, with the absolute ISO in the element's `title`; STAT-01). It replaces the `relativeTime` helper that Phase 2 kept inside `requests-list-page.tsx`. It uses plain arithmetic, with no date library and no `Intl.RelativeTimeFormat`.

| Part | What it does |
|------|--------------|
| `UNITS` | `d` (86 400 000 ms), `h` (3 600 000 ms), `min` (60 000 ms), largest first. |
| `ago(iso, now?)` | `—` for `null` or `undefined`. Otherwise it takes the gap between `now` (default `Date.now()`) and `iso`. A gap under 45 s either way is `just now`. Otherwise it picks the largest unit the gap reaches and rounds: `5 min ago`, `3 h ago`, `2 d ago`. A future time reads `in 13 d`, which the requests list's `Expires` column needs. A gap of 45 to 59 s falls back to minutes, so it reads `1 min ago`. |
| `minutesSince(iso, now?)` | Whole minutes since `iso`, floored (30 s gives 0, eleven minutes gives 11). Used for staleness checks such as "last seen N min ago". |

`now` is injectable on both so tests are deterministic.

## Callers

- `features/requests/requests-list-page.tsx` (`Sent` and `Expires` cells).
- Phase 3 dashboard, request page, and document lists (Plans 03-02 to 03-05).

## Tests

`relative-time.test.ts` (`web` project, fixed `now`): 10 s gives `just now`, 5 min gives `5 min ago`, 3 h gives `3 h ago`, 2 d gives `2 d ago`, 13 days ahead gives `in 13 d`, `null` and `undefined` give `—`, and `minutesSince` gives 11 and 0.
