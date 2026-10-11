# `app/src/features/logics-push/push-sheet.tsx`

The confirmation sheet that opens from the push card's button. It shows exactly what will land in the Logics case before anything is sent (Phase 5 D-07, D-09, PUSH-01, PUSH-02).

| Part | What it does |
|------|--------------|
| `errorText(e)` | Turns a push refusal into one sentence. `logics_write_blocked` shows the Worker's own message (it names the case, e.g. `Case 123 is not on the test allowlist`); other codes use `PUSH_ERROR_COPY`; anything else is `GENERIC_ERROR`. |
| `Section` | A small titled block (Files, Comment, Activity note). |
| `PushSheet(props)` | `open`, `onOpenChange`, `requestId`, `caseId`, `agentName` (the signed-in staff name), `mode`, `selected` (`PushableDoc[]`), `onDone`. Uses `useCreatePush(requestId, caseId)`. |
| Title | `Push to Logics (simulated)` in fake mode, `Push to Logics` in live mode, plus the line `This will write to the Logics case.` in live mode only. Description: `Review what will land in the Logics case.` |
| Files | One line per selected document: `{name} · {size} · {plan label}`. A `manual` plan is shown in destructive text with `· Won't be sent` and is left out of `document_ids`. |
| Comment | `Uploaded via ResSpark by {agent} — {file}` for each file that will be sent (the per-document comment; the consumer appends `(part n of m)` when it splits). |
| Activity note | `Documents uploaded via ResSpark by {agent}: {files}`, the same shape as the Worker's `buildActivityComment`, with split files expanded to `{name} (part k of N)` using the estimate. The `rs:` ids are not shown; the muted line `IDs are added automatically.` says so. |
| Confirm | `Push {n} files` / `Push 1 file`, disabled with nothing sendable and while the request runs (`Pushing…`). Posts `{ document_ids }`, plus `push_again` only when a selected row had `Push again` ticked. On success: `toast.success('Push started')` and `onDone()` (the card closes the sheet and clears its selection; the hook invalidates the ledger). |
| Errors | Shown in place in a destructive `Alert` (`role="alert"`); the sheet stays open. |

## Tests

`push-sheet.test.tsx` (`web` project; `createPush` and `sonner` mocked): fake-mode title, file lines with sizes and plans, the HEIC row with its reason and `Won't be sent`, the comment, the exact note preview with `big.pdf (part 1 of 2), big.pdf (part 2 of 2)`, and `IDs are added automatically.`; `Push 2 files` posts only the two PDFs, toasts `Push started`, and calls `onDone`; `push_again` is forwarded; `logics_write_blocked` shows the server message; `already_pushed` shows our copy; live mode shows `Push to Logics` and `This will write to the Logics case.`.
