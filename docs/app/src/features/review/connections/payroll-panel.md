# `app/src/features/review/connections/payroll-panel.tsx`

The employers, their last three months of pay, and their documents on a payroll connection card (Plan 04-06; PAY-02, PAY-04; Oct 12 call item G).

| Part | What it does |
|------|--------------|
| `TYPE_LABEL` | Document type labels: `pay_stub` → `Pay stub`, `w2` → `W-2`, `income_report` → `Income report`, `form_1099` → `1099`, `other` (or anything unknown) → `Document`. The keys match `TruvFileKind` in `app/worker/src/integrations/truv/reports.ts`. |
| Empty | No employers gives `No employers yet`. |
| Employer block | `company_name ?? 'Employer'`, the `employerBadge(status)` badge (`Done`, `Needs attention` for `error`, and so on), and `employerCounts(e)` (`2 pay stubs · 1 W-2 · 1 income report`, zeros omitted, `No documents yet` when all are zero). `data-employer` holds the id. |
| `RecentPay` | Rendered under the header only when `recent_pay` has rows (the Worker fills it from the stored Truv income report, see `connections-ops.md`). A compact house `Table` headed `Last 3 months` with columns Pay date, Gross, Net, and an unlabeled stub column; each row carries `data-pay-date`. Dates are the ISO day formatted in UTC (`Sep 15, 2026`, `formatDay`); money is right-aligned in `tabular-nums`; a `null` amount shows `—`. The last cell is a `DocLink` labelled `Stub` when the Worker matched the stub to a stored file, otherwise empty. Below the rows one muted line sums the window: `3 pay stubs · gross $5,950.50 · net $2,980.25` (singular `1 pay stub`); `null` amounts count as zero in the totals. It answers the call's ask to see whether "their income comes the same or not" the way the bank card shows months. |
| Money formatting | `formatMoney` and `formatDay` come from `app/src/features/financials/format.ts`, the unsigned USD formatter. The sibling `money.ts` `formatMoney` is for Plaid transactions and flips the sign (a positive amount renders as `−$…`), which would show gross pay as negative. |
| `DocLink` | The link-style button both the table and the document list use: `openSigned(documentUrl(id, 'inline'))`. The card links to the same signed-URL route as the Phase 3 review panel and never fetches a second copy (D-06, D-09). |
| Document links | One `DocLink` per document in a list, `{type label} · {file name}`. These are the same `documents` rows the review panel lists under the request item. |
