# `app/scripts/db-migrate.mjs`

The idempotent migration runner (D-10). It applies `supabase/migrations/*.sql` in name order to the live project through `lib/supabase-cli.mjs`, and records each applied file in `public.app_migrations`. It replaces `supabase db push`, which needs the database password.

Usage, from the repo root (or `pnpm -C app run db:migrate`):

```
node app/scripts/db-migrate.mjs             # apply pending migrations
node app/scripts/db-migrate.mjs --dry-run   # print "N pending:" and the names
node app/scripts/db-migrate.mjs --status    # print applied names, one per line
node app/scripts/db-migrate.mjs --query "select count(*)::int as n from public.firms"
```

| Lines | What it does |
|-------|--------------|
| 1-5 | `node:` imports plus `query`/`queryFile` from the CLI wrapper. |
| 11-13 | Resolves `supabase/migrations` from the script's own location, so the runner works from any cwd. Reads argv. |
| 15-21 | `--query "<sql>"` runs one ad-hoc query and prints its rows as indented JSON, e.g. `"n": 0`. Later plans use it in their verification commands. It throws if the SQL is missing. |
| 23-28 | Bootstrap: creates `app_migrations` if it is missing, turns RLS on, and revokes `anon`/`authenticated`, all in one query. The runner works on a project that has never seen 0002. |
| 30 | Reads the set of applied names. |
| 32-35 | `--status` prints the applied names and exits 0. |
| 37-40 | Lists `*.sql` sorted by name. A file is pending when its name without `.sql` is not in `app_migrations`. |
| 42-46 | `--dry-run` prints `N pending:` and the pending names, then exits 0. With nothing pending the first line is `0 pending:`. |
| 48-60 | Applies each pending file in order and inserts its name into `app_migrations` only after the file succeeded. Single quotes in the name are doubled. On the first failure it prints `FAIL <name>: <reason>` and exits 1. The file's own `BEGIN`/`COMMIT` rolls back the partial work, and the name is not recorded, so a fixed file can simply be re-run. |
| 62-63 | Prints `applied N, skipped M`, and `0 pending` when nothing was applied. |

## Current status (2026-10-11)

`--status` prints `0002_platform_foundation`. A re-run prints `applied 0, skipped 1` / `0 pending`.
