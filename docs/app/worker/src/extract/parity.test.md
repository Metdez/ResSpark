# `app/worker/src/extract/parity.test.ts`

Proves the TypeScript extractors equal the Python oracle (D-17). Runs in the `worker-node` Vitest project:

```powershell
pnpm -C app exec vitest run --project worker-node worker/src/extract
```

| Part | What it does |
|------|--------------|
| `Outcome`, `Golden` | The fixture shape: each case has `expected` (the parsed object) or `error` (the Python `ValueError` message). |
| `ROOT`, `golden`, `pdfBytes` | The repo root (four levels up from this file), the parsed `app/worker/test/fixtures/engine/golden-extract.json`, and a reader for an example PDF by its repo-relative path. |
| `has fixtures to compare` | Fails if the fixture has no PDFs, so an empty export cannot pass silently. |
| `parse_texts <name>` | For every `texts_cases` entry: `parseTexts` equals `expected` with `toEqual`, or throws an `ExtractError` with exactly the Python message. |
| `page text and parse of <path>` | For every `pdfs` entry: `pageText` of the file equals `page_text` (texts and rows), and `parsePdf` with the path as label equals `expected` or rejects with the Python message. |

Never loosen an assertion to make a case pass: fix the port, or regenerate the fixture after a deliberate oracle change (`python src/tools/export_golden_fixtures.py`).
