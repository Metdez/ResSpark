# `app/scripts/lib/supabase-cli.mjs`

A small wrapper that every script uses to reach the live Supabase project through the Supabase CLI's Management API path. That path needs no database password (D-10). It uses Node built-ins only.

| Lines | What it does |
|-------|--------------|
| 1-4 | Imports from `node:` modules only. |
| 6 | `PROJECT_REF`: the ResSpark project `zvkphuikjpwoauqdimcf`. |
| 8-15 | `getWorkdir()` (exported since Plan 05 so `supabase-config-push.mjs` can copy `supabase/config.toml` into it) creates one temp directory per process (`mkdtempSync(join(tmpdir(), 'resspark-supabase-'))`) on first use. The CLI runs there because it fails to parse the repo-root env file and would pick up a `supabase/` folder (RESEARCH F-10, Pitfall 4). `--linked --project-ref` names the project explicitly, so no `supabase link` is needed and no `supabase/.temp` is written to the repo. |
| 17-20 | On Windows `npx` is a `.cmd` file that needs a shell. The arguments are joined into one pre-quoted command string. They are only flags, the ref, and file paths, never raw SQL. Passing one string also avoids Node's DEP0190 warning about passing args with `shell: true`. |
| 22-35 | `runSupabase(args, { input })` runs `npx -y supabase@2.120.0 <args>` (version pinned) and returns stdout. stderr is inherited, so the CLI's own progress lines (`Initialising login role...`) still show. A non-zero exit throws `supabase <a0> <a1> failed (exit N)`. The message never includes stdout or stderr, because query output may hold client data. |
| 37 | `DB_QUERY`: the shared `db query --linked --project-ref <ref> -o json` arguments. |
| 39-43 | `parseRows`: with `-o json`, CLI 2.120.0 wraps results as `{ boundary, rows, warning }`. This returns `rows`, or the value itself if a later CLI returns a bare array. |
| 45-47 | `queryFile(absPath)` runs an SQL file (`-f <absolute path>`) and returns the rows of its result. Relative paths would resolve against the temp workdir, so always pass an absolute path. |
| 49-55 | `query(sql)` writes the SQL to a numbered file in the workdir and calls `queryFile`. It uses a file rather than the CLI's positional argument because `cmd.exe` would mangle quotes and spaces in SQL. |

## Usage

```js
import { query, queryFile, PROJECT_REF } from "./lib/supabase-cli.mjs";
const rows = query("select count(*)::int as n from public.firms");
```

Callers: `app/scripts/db-migrate.mjs` and `app/scripts/reconcile-questions.mjs`. Plans 05 and 08 will reuse it.

## Security note

The CLI uses its stored login (a classic personal access token with full account access). This is threat T-01-18, accepted for developer machines. Create a scoped token in `SUPABASE_ACCESS_TOKEN` before any CI use.
