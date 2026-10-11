# `app/worker/test/docuseal-contract.test.ts`

Opt-in contract check against the real DocuSeal API in Test Mode (Plan 06-08, RESEARCH A3). Every other e-sign test stubs DocuSeal from fixture JSON; this one proves the fixtures still match the live API. It calls the real `integrations/esign/docuseal.ts` functions, so their response guards are part of what it checks.

Skipped, with a printed reason (`docuseal contract skipped: missing DOCUSEAL_API_KEY or DOCUSEAL_CONTRACT_TEMPLATE_ID`), unless both names are set in the env files `pnpm -C app test:live` loads. `DOCUSEAL_CONTRACT_TEMPLATE_ID` is the numeric id of a one-signer Test Mode template (the `Engagement letter (demo)` template works). `DOCUSEAL_API_URL` defaults to `https://api.docuseal.com`, the same value as the `wrangler.jsonc` var.

Run alone: `pnpm -C app test:live:file worker/test/docuseal-contract.test.ts`.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports `randomUUID`, Vitest, and the five DocuSeal client functions under test. |
| 7-11 | Reads the three env names; `live` needs a key and a positive integer template id. Prints the skip reason when not live. |
| 13 | A minimal `Env` with only the two DocuSeal fields the client reads. |
| 14-15 | `report(line)`: prints `docuseal contract: <line>` with ids and statuses only, never a slug, URL, or key. |
| 17-51 | One test, 30 s timeout: |
| 19 | `listTemplates` includes the template id. |
| 20-22 | `getTemplate` has exactly one submitter role (the D-11 template contract). |
| 24-38 | `createSubmission` with `send_email: false` and `send_sms: false` at both levels, an ISO 8601 `expire_at` one day ahead, and one submitter (`Contract Test`, `contract.test@example.com`, a random `external_id`, the template's role). |
| 39-44 | The response is an array (RESEARCH contradiction 2) whose first entry has a numeric `submission_id`, a string `slug`, and an `embed_src` starting `https://docuseal.com/s/`. If ISO `expire_at` were refused, DocuSeal would answer 422 and the client would throw `http_422` here. |
| 46-49 | `getSubmitter` returns the same slug; `getSubmission` reports `status 'pending'`. |

## Notes

- Test Mode submissions are free and unlimited, and nobody is emailed (`send_email: false`, `example.com` address), so the test does no cleanup. Pending test submissions expire after a day.
- It needs no Supabase env and touches no database row.
- `pnpm -C app check` collects this file in the `worker-node` project; without the two names it is reported skipped there too.
- Vitest shows the skip reason (on stderr) only with `--reporter=verbose`; the default reporter just counts the file as skipped. The describe title also names the two required variables.
