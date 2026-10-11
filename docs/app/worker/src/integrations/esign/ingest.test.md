# `app/worker/src/integrations/esign/ingest.test.ts`

Unit tests for `ingest.ts` (Plan 06-04). `storeProviderFile` is replaced by a hoisted `vi.fn()` so the exact storage arguments can be asserted; `fetch` is stubbed per test with `vi.stubGlobal` and restored after each. Submissions come from `test/fixtures/docuseal/submission_completed.json`. `codeOf` turns a rejection into the thrown `ProviderError` so `code` and `transient` can be matched. The cases are listed in `ingest.md` under Tests.
