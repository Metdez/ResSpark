# `app/scripts/reconcile-questions.mjs`

The D-13 question-contract reconciliation. It diffs the question ids declared in `src/questions.py` against the rows of `public.question_definitions` on the live project. It reports the difference in both directions and, only when asked, adds missing rows. It never writes `src/questions.py`, never deletes or updates a row, and never inserts anything unless `--apply` is passed and ids are actually missing.

Usage, from the repo root (or `pnpm -C app run questions:reconcile`):

```
node app/scripts/reconcile-questions.mjs           # report; exit 0 = no diff, 2 = diff
node app/scripts/reconcile-questions.mjs --apply   # also INSERT missing rows, then re-report
```

| Lines | What it does |
|-------|--------------|
| 1-5 | `node:` imports plus `query` from `lib/supabase-cli.mjs`. |
| 11-12 | Reads `src/questions.py`, resolved from the script's own location. |
| 14 | `ids`: every `"id": "<snake_case>"` in the file, matched with the plan's regex `/"id":\s*"([a-z0-9_]+)"/g`. |
| 15-17 | `entries`: the full `{"id", "prompt", "type"}` triple of each declaration. `--apply` needs these to build rows. |
| 18-21 | Throws if any id fails to parse as a full entry. Without this check, a reformatted `questions.py` could make `--apply` insert a partial set. |
| 23 | `sqlText`: wraps a value as an SQL string literal and doubles single quotes (`spouse's`). Values come from the repo's own source file, not from users. |
| 25-37 | `report()`: reads `question_id` from `question_definitions` and returns `{ code_ids, db_ids, missing_in_db, extra_in_db }`. Both lists are sorted. |
| 39-52 | When ids are missing, it builds `INSERT ... (question_id, prompt, value_type, canonical_column) ... ON CONFLICT (question_id) DO NOTHING`. `value_type` is the Python type name (`bool`, `int`, `float`, `str`, matching the column's CHECK), and `canonical_column` is the id, as in every seeded row. Without `--apply` it only prints the statement. With `--apply` it runs it and re-reports. |
| 54-55 | Prints the report as JSON. Exits 0 when both lists are empty, otherwise 2. Extra DB rows are never deleted, because removing a question is a deliberate intake-version change. |

## Result (2026-10-11)

```json
{
  "code_ids": 28,
  "db_ids": 28,
  "missing_in_db": [],
  "extra_in_db": []
}
```

The contract is 28 ids. The "32" in `CLAUDE.md` and `.planning/PROJECT.md` is a stale number. Those docs were not edited here; correcting them is the user's call.
