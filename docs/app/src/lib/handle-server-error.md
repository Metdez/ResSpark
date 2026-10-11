# `app/src/lib/handle-server-error.ts`

The mutation error handler wired in `main.tsx`. Reduced from the fork's axios-aware version.

| Lines | What it does |
|-------|--------------|
| 1 | `toast` from sonner. |
| 3 | `shortcut:` note — Plan 03 adds the `{ error: { code, message } }` envelope mapping and the staff copy from the UI-SPEC. |
| 4-6 | Shows the `Error` message, or the generic `Something went wrong` for anything that is not an `Error`. |

## Tests

`app/src/lib/handle-server-error.test.ts` (project `web`): mocks `sonner`, asserts an `Error` surfaces its
message and a non-`Error` value surfaces the generic text.
