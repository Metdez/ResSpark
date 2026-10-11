# `app/src/lib/consent-text.ts`

The "Use of data" statement a client agrees to before a bank or payroll provider opens (D-12, BANK-05, PITFALLS C7). Shared by the SPA, which shows it, and the Worker, which records which version was agreed to.

## Exports

- `ConsentKind`: `'bank_data' | 'payroll_data'`, the values of `consents.kind` (migration 0005 CHECK).
- `ConsentText`: `{ version, title, body, detail, agree }`.
- `CONSENT_TEXT`: one entry per kind.
  - `version`: `'2026-10-10.1'` for both. The Worker refuses any other version with 409 `consent_text_stale`, so a client who read old wording must reload. **Any change to `body` or `detail` needs a new version**; the old consent rows then stop satisfying the gate and the client is asked again.
  - `title`: "Before we connect your bank" / "Before we connect your payroll".
  - `body`: the D-12 sentence verbatim (6 months of transactions and monthly statements for bank; pay stubs, W-2s, employment and income details for payroll), ending with "We never see your bank/payroll password."
  - `detail`: who receives the data; `{firm}` is replaced by the SPA with the firm name. The bank text also states the 30-day connection removal (BANK-06).
  - `agree`: the button label, "I agree".
- `consentKindForItem(kind)`: `bank_connect` → `bank_data`, `payroll_connect` → `payroll_data`.

## Used by

- `app/worker/src/routes/c-connections.ts` (`POST /api/c/consents`, the consent gate on start, `consented` in the item view).
- The client connect step (Plan 04-05).
