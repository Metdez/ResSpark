# `app/scripts/lib/dev-vars.mjs`

A shared helper for the git-ignored `app/.dev.vars`, the only local file where a secret value may be written. `provision-secrets.mjs` and `create-staff.mjs` both use it.

| Lines | What it does |
|-------|--------------|
| 1-2 | Imports `node:fs` and `node:url` only. |
| 4-5 | `DEV_VARS` is the absolute path of `app/.dev.vars`, resolved from this file's location, so the cwd does not matter. |
| 7-11 | `devVarKeys()` returns the set of key names already present (lines matching `NAME=`). A missing file gives an empty set. It never returns values. |
| 13-29 | `appendMissingDevVars(entries)` takes `[key, value, comment?]` tuples. It skips keys that already exist, puts an optional `# comment` line above a new key, adds a leading newline if the file does not end with one, and appends. On a new file it uses mode `0600`. It never rewrites an existing line, so a re-run cannot clobber a value. It returns how many keys it wrote. |

Wrangler (`wrangler dev`) and `dotenv-cli` (`staff:create`, `test:live`) both parse this file in dotenv format. That is why comments go on their own lines and are never inline.
