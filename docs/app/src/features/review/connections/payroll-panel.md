# `app/src/features/review/connections/payroll-panel.tsx`

The employers and their documents on a payroll connection card (Plan 04-06; PAY-02, PAY-04).

| Part | What it does |
|------|--------------|
| `TYPE_LABEL` | Document type labels: `pay_stub` → `Pay stub`, `w2` → `W-2`, `income_report` → `Income report`, `form_1099` → `1099`, `other` (or anything unknown) → `Document`. The keys match `TruvFileKind` in `app/worker/src/integrations/truv/reports.ts`. |
| Empty | No employers gives `No employers yet`. |
| Employer block | `company_name ?? 'Employer'`, the `employerBadge(status)` badge (`Done`, `Needs attention` for `error`, and so on), and `employerCounts(e)` (`2 pay stubs · 1 W-2 · 1 income report`, zeros omitted, `No documents yet` when all are zero). `data-employer` holds the id. |
| Document links | One link-style button per document, `{type label} · {file name}`, calling `openSigned(documentUrl(id, 'inline'))`. These are the same `documents` rows the Phase 3 review panel lists under the request item. The card links to the same signed-URL route and never fetches a second copy (D-06, D-09). |
