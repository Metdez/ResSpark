---
quick_id: 261018-kgl
slug: incorporate-oct-12-valortax-call-feedbac
status: complete
completed: 2026-10-19
branch: zack
source: .planning/Client/call2.md
---

# Summary: Oct 12 ValorTax call feedback

Every product ask from the Oct 12 call is built, tested, committed on `zack`, and migration 0011 is applied to the live Supabase project. Six work streams ran in parallel on disjoint files; the orchestrator did the shared edit, the migration apply, the full check, and the deploy.

## What changed, by call item

| # | Ask | Done |
|---|---|---|
| A | Default packet = bank + payroll | Migration 0011 seeds the global template **Bank and payroll** (`…a003`); the request builder preselects it, falling back to the Standard packet then the first template. Standard packet (address, ID, engagement letter, intake) stays in the dropdown. |
| B | Plaid / Truv visible to the client | `ProviderMark` renders "Secure connection powered by Plaid / Truv" under the message on the bank and payroll sheets (16 px, hidden when connect is unavailable). Display reads `provider.id`; behaviour still branches on capabilities (D-11). The old "no vendor names" test was reversed. |
| C | Green when connected; bank item not a "documents" placeholder | `connection_set_status`: a **done bank or payroll** connection moves its item to `approved` (client "Done", staff "Approved", request completes when all required items are approved) and logs `item.approved` with actor `provider` and `auto: true`. Signatures still submit for staff review. Review panel: connection items with no files say where the accounts/transactions or employers are instead of "No files yet". |
| D/F | Readable file names in Logics | `storeProviderFile.displayName` → `documents.original_filename` while storage keys stay as before. Names: `Bank statement - September 2026 - x1234.pdf`, `Pay stub - October 12, 2026 - check 1001.pdf`, `W-2 - 2025.pdf`, `Income report.pdf`, `Transactions - September 2026 - x1234.pdf`. Logics pushes and the review list use the same field. Migration 0012 backfilled the 118 rows stored before 2026-10-18 (70 statements, 32 pay stubs, 12 W-2s, 4 income reports). |
| E | Select all + push | "Select all" checkbox on the Logics push card (indeterminate when partial; never selects sent, in-flight, unknown or manual rows). |
| G | 3-month pay stub snapshot | `EmployerView.recent_pay` (pay date, gross, net, stub document) from the stored Truv income report, 3-month window; the payroll card shows a "Last 3 months" table with totals. |
| H | Bank statement PDFs when the bank has none | After transaction history is complete, `generateTransactionPdfs` renders one "Transaction statement" PDF (pdf-lib, labelled not official) per account per window month whose cell is `not_supported`/`missing` and has no document, stores it on the bank item (`document_type bank_transactions`) and attaches it to the cell; the admin grid shows "From transactions" and opens it. A failure is logged as `connection.transaction_pdfs_failed` and never blocks `done`. |
| I | Duplicate-case warning | `GET /api/admin/cases/:id` returns the case's non-revoked requests; the builder shows an "A request already exists for this client" alert with sender, status, age and a link. Creating another request stays allowed. |
| J | Who sent it | "Agent" column on the Requests list; "Sent by {agent}" in the request page header. |
| K | Email typo validation | Already in place (REQ-02). Eight more known domains (live, msn, me, att, sbcglobal, verizon, proton, ymail). |
| L | "Categorize all of these transactions… here's everything that's rent, car payment, utilities; here's what the client's expenses are" (10:44) | `Spending by category · last N months` above the transaction rows on the bank card (2026-10-19): settled outflows grouped into 433-A words (Rent, Mortgage, Car payment, Utilities, Phone/internet/cable, Insurance, Fuel, loans, then Plaid primaries), with count, total and per-month average, plus an `Income deposits` line. Display only; the allowable comparison stays on the 433-A worksheet. No Plaid Income Insights add-on needed: the v2 `personal_finance_category` already on every row carries it. |

## Not built (out of scope or no access)

Twilio SMS and the short URL (user: out of scope), Plaid Signal/Balance for receivables, Logics recurring-payment pause, the Logics console-script repo, switching e-sign to Anvil, Plaid Income Insights. Staff permission rules for approvals: no decision on the call; the bank/payroll auto-approve above is the one change.

## Decisions recorded

- Auto-approve is limited to connection kinds `bank` and `payroll`. DocuSeal signatures also report `done` through the same RPC and would otherwise have skipped the Phase 6 review; the call did not ask for that.
- Provider branding is text (nominative use), no logo assets; the client-portal "no vendor names" rule is replaced by "one trust line on the connect sheets".
- Generated transaction PDFs keep the month cell's status so a real statement upload still wins; the client portal cells are unchanged (the client may still upload a real statement).
- `DEFAULT_TEMPLATE` falls back through the Standard packet so a database without 0011 does not default to "Documents only".

## Commits (oldest first)

90ce5ef plan + displayName + typo domains · ed63827 / bf72903 portal provider mark · 5068f6d / c4c7fbc migration 0011 · 1635160 transaction PDFs · c077fdd / b869d2c / c3125fb names, review copy, select all · f42cbae pay-stub table · b1a38e2 / 8465e96 requests UX · (test) lookup route test · b144e01 migration 0012 backfill · (2026-10-19) spending by category on the bank card.

## Verification

- Migrations 0011 and 0012 applied with `node app/scripts/db-migrate.mjs` (verified: three global templates; `connection_set_status` contains the bank/payroll approve branch).
- Per-stream targeted vitest runs all green (portal 37, migration-adjacent unit tests unchanged, PDFs 13 + 35, names/review/select-all 22 + 29, pay stubs 29, requests UX 53 + 7, lookup route 26).
- Full `pnpm -C app check` and the deploy/smoke results are recorded in STATE.md and HANDOFF.md under this task.

## Follow-ups worth doing

- Live tests under `app/worker/test` that assert the done transition were updated to `approved` and need a live run (`pnpm -C app test:live`) after the deploy.
- Client-portal month cells could show the generated transaction PDF as "received"; left as is so the upload fallback stays prominent.
