---
quick_id: 261018-kgl
slug: incorporate-oct-12-valortax-call-feedbac
created: 2026-10-18
source: .planning/Client/call2.md (ResSpark Meet, Oct 12 2026, Zack + Andrew)
status: in_progress
branch: zack
---

# Quick task: incorporate the Oct 12 ValorTax call feedback

## What the call asked for (product only; everything else on the call was bloat)

| # | Feedback (timestamp) | Where it lives today | Change |
|---|---|---|---|
| A | "I added some bloat: confirm your address, government ID, engagement letter. Need to get rid of. The main things we care about is connect your bank, connect your payroll." (1:48) | Default template is the DB-seeded `Standard resolution packet` (6 items). | New global template **Bank and payroll** (bank_connect, payroll_connect); the builder preselects it. Standard packet stays in the dropdown for the optional items. |
| B | "I would want Plaid's logo or Truv's logo where it's more clear to the client." (2:43) | Client portal forbids vendor names; a test enforces it. | A "Secure connection powered by Plaid / Truv" line on the bank and payroll sheets, driven by `provider.id` the worker already sends. Text only (nominative use); no logo assets. Reverse the no-vendor-name test. |
| C | "It's trying to look for documents, but the output Plaid is returning is not documents … if we go to transactions." (4:41) and "I want this to be green so people can be like, okay, I'm connected. Right now it's saying yellow 'with agent'." (5:07) | A done connection moves the item to `submitted` (amber "Needs review" / "With your agent"); a bank item with no statement PDFs can never be approved (`hasFiles` gate), so the request never completes. | `connection_set_status`: `done` → item **approved** (logs `item.approved`, actor `provider`). Connected/syncing still → `submitted`. Review panel: kind-aware empty copy pointing at the connection card instead of "No files yet". |
| D | "Clean up all this weird UI. So we just have the bank statements." (6:45) | Provider files are named `2026-09.pdf`, `paystub-2026-10-12.pdf`, `w2-2025.pdf`. | Human-readable `original_filename` at the source (storage key unchanged): `Bank statement - September 2026 - x1234.pdf`, `Pay stub - October 12, 2026.pdf`, `W-2 - 2025.pdf`. |
| E | "Select all so you could just select all of them … click all, boom, send." (7:02, 34:46) | Push card has one checkbox per file, no select-all. | "Select all" checkbox on the push card. |
| F | "Pay stub underscore October 12, 2026 … an actual person has to see this inside Logics." (8:00) | Logics gets `original_filename` unchanged. | Covered by D (the push uses `original_filename`). |
| G | "On the bank stuff you have the last three months. Could you do the same thing on the pay stub side? Their income comes the same or not." (10:00) | Payroll panel shows counts and file links only. | Per employer, a "Last 3 months" table: pay date, gross, net, stub link, with totals, from the stored Truv income report. |
| H | "If they wanted to download the last three months of a checking account … I can write something that creates a PDF." (19:24–20:52) | Plaid Statements is already integrated (BANK-01/02). The sandbox bank returned none, so months read "Not from this bank" and nothing can be pushed. | Generate a monthly **transaction statement PDF** (pdf-lib) for every window month the bank cannot provide, once history is complete; store it on the bank item so it shows in Review and can be pushed to Logics. Month cells keep their status but gain the document. |
| I | "If they try to search someone that we've already done, a little UI: hey, we've done it for this guy, here's his case." (32:54) | Duplicates are allowed and nothing warns. | `GET /api/admin/cases/:id` also returns the case's existing requests; the builder shows an "Already sent" alert with sender, status, and a link. Creating a second request stays allowed. |
| J | "We can show what team member is sending it. Zack sent…" (33:43) | The list API returns `agent_display_name`; the Requests table drops it. | "Agent" column on the Requests list; "Sent by {agent}" on the request page header. |
| K | "Have email validation before you send … gmail.con, forgot the @." (40:53) | `checkContact` already blocks bad syntax, 10-digit phones, and did-you-mean on 7 domains. | Already done. Extend the known-domain list (live, msn, me, att, sbcglobal, verizon, proton, ymail). |

## Explicitly out of scope (said on the call, not built)

Twilio SMS and the short URL (user: out of scope), Plaid Signal/Balance for receivables, Logics recurring-payment pause, the Logics console-script repo (Andrew will share), switching e-sign to Anvil, Plaid Income Insights (paid add-on; `plaid_category_map` already categorizes). Staff permission rules for approvals were an open question with no decision.

## Work streams (each an executor; disjoint files)

- **WS1 Migration 0011** — `supabase/migrations/0011_bank_payroll_template_auto_approve.sql` + doc. Template a003; `connection_set_status` done → approved.
- **WS2 Requests UX** — A (builder default), I (dup warning: worker `GET /cases/:id` + builder alert), J (Agent column, Sent by).
- **WS3 Provider branding** — B (`provider-mark.tsx`, bank/payroll sheets, tests, docs).
- **WS4 Names + review + select-all** — D/F (display names at source), C-review copy, E.
- **WS5 Pay-stub snapshot** — G (`employerViews.recent_pay`, payroll panel table).
- **WS6 Transaction PDFs** — H (`pdf/transactions-statement.ts`, `jobs/bank-transaction-pdfs.ts`, hook in `bank-reconcile.ts`, grid/cells show the generated file).
- **Orchestrator** — shared `storeProviderFile.displayName` (done first), K, migration apply, `pnpm -C app check`, deploy snapshot + smoke, SUMMARY.md, STATE.md.

## Rules for every stream

- Ponytail: smallest complete change; no new dependencies; reuse house components (`StatusBadge`, `Alert`, `Checkbox`, `Table`).
- No code file over 500 lines; a companion `docs/` markdown for every new or changed file.
- Path-limited commits only: `git add <paths> && git commit -m "…" -- <paths>` (the working tree holds unrelated uncommitted user changes). Conventional prefixes (`feat:`, `fix:`, `docs:`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests: targeted `vitest run --project web|worker-node <file>`; `tsc -b` before the final commit. Executors do not deploy and do not apply migrations.
