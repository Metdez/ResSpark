# `app/src/features/financials/extract-button.test.tsx`

Component tests for `ExtractButton` and the `isExtractResult` guard (`web` project). The harness is `renderWithQuery` from `@/test-utils/query-render`. `@/lib/supabase` and `sonner` are mocked, and `./api` keeps its real exports except `extractValues`, which is a `vi.fn`.

| Part | What it does |
|------|--------------|
| `RESULT` | A result with 3 documents, 2 parsed, one `no_template` failure (`scan.pdf`), one `not_pdf` skip (`photo.png`), and 4 inserted proposals. |
| Pending, toast, list, invalidate | Holds the promise open to see the disabled `Reading documents…` button. It then resolves and checks the toast text, the `Documents not read` list in plain words with no raw code, and a spy on `QueryClient.prototype.invalidateQueries` called with `['financials', 'C1']`. |
| Every reason | `missing_fields`, `unreadable` and `too_large` render as `Required values not found`, `Could not read this PDF` and `Too large`. |
| `isExtractResult` | Accepts `RESULT`; rejects an unknown reason and `proposals: null`. |
