# `app/src/features/logics-push/use-logics-push.ts`

React Query hooks for the Logics push ledger, and the helper that picks which ledger rows to show per document.

| Part | What it does |
|------|--------------|
| `useLedger(requestId)` | `useQuery` on `['logics-ledger', requestId]` with `fetchLedger`, `refetchInterval: pollInterval` (5 s, 30 s after an error), `placeholderData: keepPreviousData`, and `meta.errorShown` (the card shows its own error). `refetchIntervalInBackground` stays at its default `false`, so a hidden tab stops polling (D-10). |
| `usePushMutation(requestId, caseId, fn)` | Shared `useMutation` setup. Errors are shown in place by the sheet and the dialog; `unlessHandled` only passes a 401 on to the app handler (sign-out). `onSettled` (also after an error, since a 409 means the ledger changed) invalidates `['logics-ledger', requestId]` and `['events', caseId]`. Mutations keep TanStack's default of no retry: a second push or resolve is always a staff decision (T-05-21). |
| `useCreatePush(requestId, caseId)` | Calls `createPush(requestId, { document_ids })`. |
| `useResolvePush(requestId, caseId)` | Calls `resolvePush(pushId, { action, logics_document_id? })`. The id key is left out entirely when staff did not type one. |
| `latestPushesByDocument(batches)` | Walks batches newest first. A document's rows come from the newest batch that contains it; within that batch, a later row for the same `part_index` replaces an earlier one (a staff `resend` marks the old row `failed`/`resent_by_staff` and adds a new row to the same batch). Rows are returned in `part_index` order. |

The signature takes `caseId` as a second argument (the plan's interface listed only `requestId`) because the `['events', caseId]` invalidation needs it.
