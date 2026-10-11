# `app/src/features/review/mirror-card.tsx`

The "Client view" card on the request page: which step the client is on, when they were last seen, the last error their page reported, and a red hint when they may be stuck (Plan 03-05; D-09, STAT-03).

## Data

The card calls `useReview(requestId)`, the same query (`['review', requestId]`) the review panel uses, so it adds no request of its own and refreshes on the same 5 s poll. It reads `request.opened_at`, `request.status`, and `client_session` (the latest `client_sessions` row for the request's links, written by the Phase 2 heartbeat every 30 s while the client's tab is visible). While the query has no data the card renders nothing; the review panel below shows the loading and error states.

## `mirrorState(input, now?)`

A pure function, exported for tests.

| Input | Result |
|-------|--------|
| no session, `opened_at` null | `{ kind: 'not_opened' }` |
| no session, `opened_at` set | `{ kind: 'no_session' }` |
| a session | `{ kind: 'active', step, seenAt, lastError, stuck }` |

`stuck` is true only when all three hold: the link was opened (`opened_at` set), `seen_at` is more than 10 minutes old (`minutesSince(...) > 10`, so exactly 10 minutes is not stuck), and the request is not `complete` or `revoked`. The heartbeat runs on the intro screen before the client taps Start, so a session can exist while `opened_at` is still null; the open check keeps the hint off in that case.

## Rendering

| State | Text |
|-------|------|
| `not_opened` | `Client hasn't opened the link yet` |
| `no_session` | `No activity in this session yet` |
| `active` | `Client is on: {step words} — last seen {ago}`; the time carries the ISO timestamp in `title`. |

Step words: the heartbeat sends a step kind (`upload`, `bank_connect`, `payroll_connect`, `address`, `signature`, `intake`), `list` for the step list, or `intro` before the client starts. `list` and null read `the step list`, `intro` reads `the welcome screen`, and any other value has its underscores replaced by spaces. The `shortcut:` comment notes that two upload items read alike; the upgrade is for the portal to send `kind:item_id`.

`Last error:` appears in muted text only when `last_error` is set. The Phase 2 fixed codes map to staff copy through `HEARTBEAT_ERROR_COPY` (`state_failed` → `Couldn't load the page`, `start_failed` → `Couldn't start`); any other value falls back to its words.

`Client may be stuck — last seen {ago}` appears in `text-red-700` with an `AlertTriangle` icon when `stuck` is true. The hint is passive: it sends no reminder or alert (reminders are Phase 8). Nothing in the card is interactive.

## Security

`last_step` and `last_error` come from the client's browser. React renders them as text; the Worker caps their length (64/200); the card never shows `user_agent_class`, IP, or `actor_id` (T-03-20).

## Tests

`mirror-card.test.tsx` covers every `mirrorState` branch (including the exact 10-minute edge and terminal statuses) and renders the card with a mocked `useReview` for the step words, the error copy and fallback, the stuck hint, and both empty states.
