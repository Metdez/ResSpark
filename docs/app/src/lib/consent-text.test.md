# `app/src/lib/consent-text.test.ts`

Web-project unit tests for `consent-text.ts`.

| Test | Proves |
|------|--------|
| esign version and points | `CONSENT_TEXT.esign.version` is `esign-v1` with five points |
| 7001(c)(1) disclosures | the points contain the paper-copy, no-fee, withdrawal (`take back`, `paper forms`), scope (`through this link`), contact-update, and device (`up-to-date web browser`, `PDF`) statements |
| item kind mapping | `bank_connect` → `bank_data`, `payroll_connect` → `payroll_data`, `signature` → `esign` |
| voice | no title, body, detail, agree or point in any entry contains `!`, `DocuSeal`, or `token` |
