# `app/worker/test/financials-extract.test.ts`

Live test of document extraction (FORM-03, D-17) against the Supabase project. Run it with `pnpm -C app run test:live:file worker/test/financials-extract.test.ts`. When `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing, the suite skips and prints a note to stderr. Everything runs under test firm `…000e`.

| Part | What it does |
|------|--------------|
| `vi.mock('../src/middleware/staff-auth')` | Sets a fixed staff context (test firm, `Test agent`), the same pattern as `financials-evidence.test.ts`. |
| `TRANSCRIPT` / `repoFile` | The synthetic Marcus Delgado account transcript from `examples/`, read from the repo root. |
| `EXPECTED` | The golden row for that file from `fixtures/engine/golden-extract.json` (Plan 07-11), so the test does not restate the extractor's numbers. |
| `extract(caseId)` | `POST /api/admin/cases/:id/financials/extract` through `app.request`. |
| `addDocument` | Uploads bytes to the `case-documents` bucket under the case path and inserts a `ready` documents row with the given mime and `document_type`. Records the key for cleanup. |
| `afterAll` | Removes the stored objects, then each fixture's `cleanup()` (proposals, documents, request). Cases and events stay, by the fixture's rule. |

## Cases

1. **Transcript to proposals, then kept.** A case with the transcript (`irs_transcripts`) and a PNG. The first POST answers 200 with `documents: 2`, `parsed: 1`, no failures, and the PNG skipped as `not_pdf`. The proposed `document` rows are exactly the golden columns minus `state_of_residence` (`csed_months_remaining`, `filing_status_married`, `tax_only_balance`, `total_tax_owed`). Each has reliability B, method `regex_extract`, the golden value, and one ref `{ kind: 'document', id, label: file name }`. GET financials contains the `document` source. A second POST returns `inserted: 0, kept: <first inserted>, superseded: 0`. No `case_financial_data` row exists, and each `financials.extracted` event payload is counts only. The round-trip time is printed to stderr.
2. **Superseded, and 404s.** After a first run, the transcript is marked `rejected` and a blank PDF is added. The second run reports the blank file as `no_template` and supersedes every earlier document proposal. Another firm's case id and a malformed id both answer 404.
