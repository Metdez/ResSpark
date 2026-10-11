# `app/src/features/client-portal/connect/bank-step.tsx`

`BankStep({ step, firmName, open, onClose })`: the bank sheet. `StepList` renders it for a `bank_connect` step.

**Current state (04-05 Task 1):** a placeholder that offers only the upload fallback, so the step is already usable. Task 2 replaces it with the full sheet (consent → hosted link, capability-keyed copy, accounts × months).

- A bottom `Sheet` titled with `step.label`, and one `Button size='xl' variant='outline'` "Upload statements instead".
- That button swaps the sheet for `UploadSheet` with the step's `{ id, label, status }`; closing it returns here and invalidates `['portal', 'state']`.
- `firmName` is accepted for the Task 2 consent sheet and is unused for now.
