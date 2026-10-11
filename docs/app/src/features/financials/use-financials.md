# `app/src/features/financials/use-financials.ts`

TanStack Query hooks for the 433-A page. Components call these, never `api.ts` directly.

| Hook | What it does |
|------|--------------|
| `useFinancials(caseId)` | `useQuery(['financials', caseId], getFinancials)` with `refetchInterval: pollInterval` (5 s, 30 s after an error; a hidden tab stops polling), so proposals written by the `financials_propose` job appear without a reload. `meta.errorShown`: the page renders its own error block, so the app-wide handler adds no toast. |
| `useLatestEvaluation(caseId)` | `useQuery(['evaluation', caseId], latestEvaluation)`: the newest run, or `{ run: null }`. |
| `DecideInput` | `{ column, action, proposal_id?, value?, note? }`. |
| `useDecide(caseId)` | `useMutation` calling `decide(caseId, column, body)`. `onError` uses `unlessHandled`: a 409 `proposal_stale` toasts `This value changed. The list is refreshed.` and stops there; anything else goes to the app's default handler. `onSettled` (also after an error) invalidates `['financials', caseId]`, so the row shows the server's truth. |
| `useRefresh(caseId)` | `useMutation` calling `refreshProposals(caseId, body)`; toasts `Refreshing proposals` on success and invalidates the view. |
| `useRunEvaluation(caseId)` | `useMutation` calling `runEvaluation(caseId)`. Its `data` keeps the last response, so `Information still needed` or `Standards unavailable` stays on screen; `onSettled` invalidates `['evaluation', caseId]`. |
| `useExportWorksheet(caseId)` | `useMutation` calling `exportWorksheet(caseId, runId)`. |

Mutations keep TanStack's default of no retry: every decision is one staff click and one RPC call.
