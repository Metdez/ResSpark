# ResSpark intake frontend

Standalone Vite and vanilla TypeScript sandbox for the taxpayer-question flow,
document upload, and follow-on resolution screening results.
It requires Node.js 18 or later.

```powershell
cd src/frontend
npm install
npm run dev
```

Use `npm test` for the focused flow/UI tests and `npm run build` for the production build.

## Data boundary

The browser keeps answers and selected files only for the open page session. It
does not send files, call the Python workflow, PostgreSQL, or the IRS standards
repository. The post-upload results are clearly marked sandbox fixtures; replace
`processMockCase` in `src/case-processing.ts` with a processor that submits the
same answers and `File` objects to the eventual API before production use.

## Resolution-results module

`src/resolution-results/` is the drop-in finish screen. Its typed result model
mirrors the Python `Determination` output, lists uploaded files, and displays the
canonical financial record in sections. The sandbox selector previews every
path currently returned by `determination.py`; omit `isSandbox` and the selector
when rendering a real backend result.

## Document-upload module

`src/document-upload/` is a drop-in screen used immediately after the final
question. Its pure request selector is the single source for frontend document
rules. IRS transcripts and bank statements are always required. Wage,
self-employment, housing, vehicle, retirement, cash-value life-insurance,
investment, and bankruptcy documents appear only when the matching intake
answer makes them applicable. A renter's lease is a required, separate upload;
homeowners and renters may optionally upload a utility statement.
Python classifies each selected file from its text, not from the slot it was
placed in. Health insurance is read as insurance.

The Python intake still defines 28 taxpayer-facing questions. This frontend intentionally presents 26 after omitting `tax_only_balance` and `csed_months_remaining`; the contributor guide's reference to 32 questions remains an existing documentation mismatch.
