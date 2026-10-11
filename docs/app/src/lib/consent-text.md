# `app/src/lib/consent-text.ts`

The "Use of data" statement a client agrees to before a bank or payroll provider opens (D-12, BANK-05, PITFALLS C7). Shared by the SPA, which shows it, and the Worker, which records which version was agreed to.

## Exports

- `ConsentKind`: `'bank_data' | 'payroll_data' | 'esign'`, the values of `consents.kind` (migration 0005 CHECK).
- `ConsentText`: `{ version, title, body, detail, agree }`.
- `CONSENT_TEXT`: one entry per kind.
  - `version`: `'2026-10-10.1'` for both. The Worker refuses any other version with 409 `consent_text_stale`, so a client who read old wording must reload. **Any change to `body` or `detail` needs a new version**; the old consent rows then stop satisfying the gate and the client is asked again.
  - `title`: "Before we connect your bank" / "Before we connect your payroll".
  - `body`: the D-12 sentence verbatim (6 months of transactions and monthly statements for bank; pay stubs, W-2s, employment and income details for payroll), ending with "We never see your bank/payroll password."
  - `detail`: who receives the data; `{firm}` is replaced by the SPA with the firm name. The bank text also states the 30-day connection removal (BANK-06).
  - `agree`: the button label, "I agree".
- `consentKindForItem(kind)`: `bank_connect` → `bank_data`, `payroll_connect` → `payroll_data`, `signature` → `esign`.
- `ConsentText.points` (optional): a bullet list shown under `body`; only `esign` uses it.

## `esign` (version `esign-v1`)

The ESIGN Act consumer disclosure (D-16, SIGN-03). One consent per link covers every form sent through that link, because consents are keyed `(link_id, kind, text_version)`. **Draft for counsel review (USER ACTION 3).** Each point answers one clause of 15 U.S.C. 7001(c)(1):

| Point | 7001(c)(1) clause |
|-------|-------------------|
| Paper copy on request, call your agent, no fee | (B)(iv) how to get a paper copy and whether a fee applies |
| Take back the agreement any time; paper forms afterwards; signed stays signed | (B)(i) right to withdraw and its consequences; (B)(iii) procedure to withdraw |
| Covers the forms your agent sends through this link | (B)(ii) scope: which transactions the consent applies to |
| Tell your agent if your email or phone changes | (B)(iii) procedure to update contact information |
| Phone or computer with an up-to-date browser that shows PDFs; this page proves it | (C)(i) hardware and software requirements, and (C)(ii) a reasonable demonstration of access |

The `body` states the signature counts the same as on paper; `detail` says the firm keeps a dated record. Voice: second person, no exclamation marks, no vendor names. Any wording change needs a new version.

## Used by

- `app/worker/src/routes/c-connections.ts` (`POST /api/c/consents`, the consent gate on start, `consented` in the item view).
- The client connect step (Plan 04-05).
