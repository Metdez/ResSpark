---
phase: 04-connect-payroll-bank
plan: 05
subsystem: client-portal/connect
tags: [client-portal, truv-bridge, plaid-hosted-link, consent, statements, a11y]
requires: [04-03, 04-04]
provides: [connection-api, CONNECT_COPY, connectErrorCopy, ConsentSheet, useConnectFlow, useItemConnection, itemConnectionQuery, useRejectionNote, loadTruvBridge, PayrollStep, BankStep, StatementCells, ReturnPage, /c/return route]
affects: [04-07, 06-02]
key-files:
  created: [app/src/features/client-portal/connect/{connection-api,connect-copy,use-item-connection,use-truv-bridge,use-connect-flow}.ts, app/src/features/client-portal/connect/{consent-sheet,payroll-step,bank-step,statement-cells,return-page}.tsx, app/src/features/client-portal/connect/{connection-api,use-truv-bridge}.test.ts, app/src/features/client-portal/connect/{consent-sheet,payroll-step,bank-step,return-page}.test.tsx, app/src/routes/c/return.tsx, docs/app/src/features/client-portal/connect/*.md, docs/app/src/routes/c/return.md]
  modified: [app/src/features/client-portal/step-list.tsx, app/src/features/client-portal/step-list.test.tsx, app/src/features/client-portal/portal-page.tsx, app/src/routeTree.gen.ts, docs/app/src/features/client-portal/{step-list,portal-page}.md]
decisions:
  - "Consent -> start is one shared hook (useConnectFlow) used by both sheets; stale consent (consent_text_stale / consent_required) reopens the consent sheet with a notice instead of a toast"
  - "The payroll sheet closes itself while Truv Bridge is open, because the modal Radix sheet blocks pointer events on the page"
  - "rejection_note reaches the sheets through listItemDocuments(step.id).item (query key shared with UploadSheet); PortalStep is unchanged"
  - "StepList gained an optional onCloseStep; every sheet close goes through it, so the heartbeat last_step returns to list"
status: complete
metrics: { duration: 60m, completed: 2026-10-11 }
actuals: { tokens: 26000, tasks: 3, commits: 19 }
plan_head_before: dbc38ea38df608df8438573d48d909508489aaaf
plan_head_after: 9b48f7c78b6b9b94bc4a31feb52f284db4ed784e
---

# Phase 4 Plan 05: Client connect sheets Summary

The client now connects payroll and bank from the phone. The payroll sheet asks for consent, opens Truv Bridge inside the portal, and reconciles only on the order-level `COMPLETED` or on close. It lists each employer with a status chip and pay-stub/W-2 counts. The bank sheet asks for consent and sends the tab to a fresh Hosted Link. On return, `/c/return` only polls `/api/c/state`. Each account shows six months, newest first: `Received`, `Checking…`, or an upload button that attributes the new document to that month. Both sheets keep `Upload … instead` available in every state, and it becomes the primary action for a rejected step.

## Commits
- 74c6fea Task 1: connection-api, copy, consent sheet, Bridge loader, payroll sheet, step-list wiring
- d0494d0 Task 2: bank sheet, statement cells, return page + `/c/return` route, regenerated route tree
- c29696e Task 3: rejection note, stale-consent retry, `onCloseStep` heartbeat reset, 44 px gates

`commits: 19` is the measured `rev-list` count from the ledger. It includes 16 commits by other executors on the shared `zack` branch; this plan made 3.

## Recorded per the plan's output spec
- **rejection_note:** read with `useRejectionNote(step, open)` from `listItemDocuments(step.id).item.rejection_note`, under key `['portal','item',id,'documents']`. It is enabled only while the sheet is open and the step is `rejected`.
- **refetchInterval:** `(q) => enabled && isActive(q.state.data?.connection?.status) ? 5_000 : false`, where active is `pending | connected | syncing`. The return page polls every `3_000`, and stops on a 401.
- **New close callback:** yes. `StepList` has `onCloseStep`, and `PortalPage` passes `() => setViewed(undefined)`.
- **Code-split gate chunks:** `connect-copy-*.js` (the only chunk with "Connect bank" / "Checking your connection") has no `SidebarProvider` or `supabase`. The Bridge URL sits only in the portal chunk `c-*.js`, as a lazy string. That chunk has a pre-existing `.supabase.co` host string from the Phase 3 upload code; it is not supabase-js. The return page builds to `return-*.js`.
- **Copy added beyond the plan:** `bank.opening` "Opening your bank…" (the plan named it in the action text but not in the copy list) and `bank.accountFallback` "Account".

## Deviations from Plan
1. **[Rule 2] Bridge overlay usability.** The modal payroll sheet hides while Bridge is open (`bridgeOpen`). Otherwise Radix would block clicks on the Bridge iframe.
2. **[Rule 1] Loader cache.** `loadTruvBridge` clears its pending promise when it settles. A cached resolved promise would have outlived `window.TruvBridge`.
3. **Shared hook `use-connect-flow.ts`** (new file plus doc). The consent-then-start logic lives in one place instead of being copied into both sheets.
4. **Grep-literal mismatches in the acceptance criteria.** The repo's JSX style is `size='xl'` (single quotes), so the `size="xl"` greps match 0. Every button in `connect/` is `size='xl'`, and the in-test 44 px gates prove it. `Your agent asked for a new copy: ` comes from Phase 3's `uploadCopy.rejectedPrefix` rather than a duplicated literal. `consent_text_stale` lives in `use-connect-flow.ts` and is wired into both sheets through it.
5. **Month upload buttons** use `h-auto min-h-11 whitespace-normal`, so the long label can wrap at 320 px. Tests assert `min-h-11`.
6. **Navigation target** is `/c`, not `/c/`, because that is the router's typed path for the index route.
7. **Coming-next tests in `step-list.test.tsx`** moved from the bank step to an `intake` step, since bank steps now open the bank sheet.

## Known limits (shortcut comments in code)
- Month attribution compares the server's `uploaded_at` with the phone clock. Upgrade path: snapshot the document ids when the sheet opens.
- The return page treats any `bank_connect` step that is with the agent as connected. A request with two bank steps could return early.
- Once a payroll connection is `done`, the sheet offers no "Add another employer" (per the plan's state table).

## Verification
Touched tests passed per task (payroll 16, bank 18, return 4, consent 3, api 7, bridge 3, step-list 10). `pnpm -C app build` is green, and `check-file-sizes` reports no offender. Full `pnpm -C app run check` exit 0: 1645 passed, 0 failed, and 7 lint warnings, none in this plan's files. Not deployed.

## Self-Check: PASSED
