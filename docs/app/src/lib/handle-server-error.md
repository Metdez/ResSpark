# `app/src/lib/handle-server-error.ts`

The single error handler for every TanStack Query query and mutation (wired in `main.tsx`). It maps the Worker's `{ error: { code, message } }` envelope, surfaced as `ApiError` by `lib/api.ts`, to the UI-SPEC staff copy.

| Lines | What it does |
|-------|--------------|
| 1-2 | `toast` from sonner and `ApiError`. |
| 4-5 | `GENERIC_ERROR`: the generic staff copy, also used by the sign-in form and the sign-out dialog. |
| 7-9 | `handleServerError(error, onSessionEnded?)`. The caller passes `onSessionEnded` because only `main.tsx` holds the router and the query client. |
| 10-15 | `ApiError` 401 (the Worker rejected the token): calls `onSessionEnded` (sign out locally, go to `/admin/sign-in?redirect=…`, clear the cache), then shows `Your session ended. Sign in again to continue.` The toast has a fixed id, so several queries failing at once show it once. |
| 16-19 | `ApiError` 403: `You don't have access to this.` The session stays. |
| 20-22 | Anything else: the generic copy, with the `ApiError` code as the muted description (staff may quote it to support). Non-API errors (network, a bug) show the generic copy without a code. |
| 26-34 | `adminErrorHandler(onApiError)` (Plan 02-08): wraps the handler for `main.tsx`. It does nothing unless `window.location.pathname` is `/admin` or under it, so client pages (`/c/*`) never get staff copy or a staff sign-out; they word their own errors. When the failing query has `meta.errorShown` (the screen renders the error itself), it skips everything except a 401, which still ends the session. |

## Tests

`app/src/lib/handle-server-error.test.ts` (project `web`): mocks `sonner` and asserts the 401 path (callback and toast), the 403 copy without a callback, the generic copy with a code for other `ApiError`s, and without a code for a plain `Error`. The `adminErrorHandler` cases set the path with `history.replaceState`: errors pass on under `/admin`, nothing passes on `/c/` (a 401 included), and `errorShown` skips a 500 but not a 401.

## Notes

- Raw `message` text from the envelope is never shown; the SPA has no known-copy map yet beyond these statuses.
- Only `/admin` routes toast. Mutations that handle some codes in-page use `unlessHandled` (`features/requests/requests-api.ts`); queries that render their own error set `meta: { errorShown: true }`.
