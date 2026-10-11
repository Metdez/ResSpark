# `app/worker/src/extract/classify.ts`

Port of `_head`, `_classify` and `_TYPE_HINTS` in `src/document_parse.py`. Decides which parser family reads a document from its first twelve text lines.

| Export | What it does |
|--------|--------------|
| `TYPE_HINTS` | Upload slot or document type to parser kind, used only when no phrase matches. `irs_transcripts` is absent on purpose: that slot can hold either transcript. |
| `head(texts)` | The first 12 lines, each stripped (Python rules) and lower-cased, joined with spaces. |
| `classify(texts, documentType)` | First rule that matches wins, in Python's order: `wage` (both "wage" and "income", or "wage and tax statement"), then the `RULES` table (`account`, `life`, `retirement`, `business`, `investment`, `bankruptcy`, `bank`, `pay_stub`, `lease`, `mortgage`, `auto`, `health`), then `valuation` for a `real_property` document type, then `TYPE_HINTS`, else `null`. Phrases are whole-word matches through `has` in `fields.ts`. |

Order matters: "rent" is checked before "mortgage", so a mortgage statement that says "rent" is read as a lease, exactly as in Python.
