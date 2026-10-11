# `app/src/features/timeline/timeline.tsx`

`Timeline({ caseId })`: the case's activity list on the request page, newest first, 50 rows at a time (Plan 03-05; D-08, D-10, STAT-04). It renders its own card with the heading `Timeline`.

## Data

| Part | What it does |
|------|--------------|
| First page | `useQuery({ queryKey: ['events', caseId], queryFn: () => fetchEvents(caseId), refetchInterval: pollInterval, placeholderData: keepPreviousData, meta: { errorShown: true } })`. It polls every 5 s while the tab is visible (30 s after an error). The review decisions of Plan 03-03 already invalidate `['events', caseId]`, so an approve or reject shows up at once. `meta.errorShown` tells the app-wide handler the card shows its own error. |
| Older pages | Not a query and never polled. `loadOlder()` calls `fetchEvents(caseId, cursor)` and stores the rows in the `older` state. |
| `cursor` | Before the first click it is the live first page's `next_before`; after a click it is the `next_before` of the last older page (`nextBefore` state; `null` means there is nothing older). |
| First-click snapshot | On the first click, `older` starts with a copy of the first page's rows. If a later poll brings new events, rows fall off the polled first page; the snapshot keeps them listed, so paging leaves no gap. |
| `dedupe(rows)` | The list is `[...first page, ...older]` filtered to the first occurrence of each `id`. The snapshot and later polls overlap; this removes the repeats while keeping newest-first order. |
| Load-older failure | Sets `olderFailed`, which shows `Couldn't load older activity. Try again.`; the button stays so the user can retry. The button is disabled while a page is loading. |

## Rendering

| State | What shows |
|-------|-----------|
| Pending | Three `Skeleton` rows (`data-timeline-skeleton`). |
| Error | A destructive `Alert` "Couldn't load the timeline" with the generic error sentence and a `Try again` button that refetches. |
| Zero events | A centred block: `No activity yet` / `Actions by you, the client, and connected providers appear here.` |
| Events | A vertical `<ol>` with a left rule in 14 px text. Each row (`data-event-row`): `ActorBadge`, the sentence from `actionLabel(action, payload)` (`data-event-label`), and `ago(created_at)` in muted text with the ISO time in `title`. |
| More to load | A 44 px outline `Load older` button, shown only while `cursor` is set. |

Unknown actions (Phase 4 provider webhooks, Phase 5 Logics push events) render through the `labels.ts` fallback, so they join the list with no code change.

## Tests

`timeline.test.tsx` mocks `fetchEvents` and spies on `useQuery`: the skeleton, the empty state, row order with badges/labels/times, the 50-row page boundary (`Load older` calls `fetchEvents('c1', next_before)`, appends below without re-rendering the first row, dedupes the overlap, and hides the button on `next_before: null`), and that only the first page uses `refetchInterval: pollInterval`.
