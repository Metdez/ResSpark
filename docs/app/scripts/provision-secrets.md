# `app/scripts/provision-secrets.mjs`

Puts the four Worker secrets on `resspark` and fills the git-ignored `app/.dev.vars` for local runs (D-07, PLAT-03). No secret value is ever printed: values pass to `wrangler secret put` on stdin and are written only to `app/.dev.vars`.

Run it with `pnpm -C app secrets:provision`. That script wraps it in `dotenv -e ../.env -e ../src/frontend/.env`. The first file gives wrangler its Cloudflare token. The second gives `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

| Lines | What it does |
|-------|--------------|
| 1-3 | Header. The rule: never `console.log` a variable that holds a value from this script. |
| 4-8 | `node:` built-ins, the `.dev.vars` helper, and `runSupabase` / `PROJECT_REF` from `lib/supabase-cli.mjs`. The Supabase CLI always runs from a temp dir, because it cannot parse the repo-root env file. |
| 10-12 | `APP_DIR` (wrangler needs it as cwd to find `wrangler.jsonc`) and the exact `USER ACTION REQUIRED` text, which lists the manual `wrangler secret put` command for all four secrets. |
| 14-17 | `requireEnv(name)` throws `Missing <name>`. The message carries the name only, never a value. |
| 19-30 | `wrangler(args, input)` spawns `npx wrangler <args>` through the shell (`npx` is a `.cmd` on Windows) with `cwd: APP_DIR`. `input` becomes stdin. When stdin is not a TTY, `wrangler secret put NAME` reads the value from it, so the value never appears in argv or the process list. stdout is captured and never echoed. A non-zero exit throws with the argument names only. |
| 32-33 | Reads the Supabase URL and publishable key from the environment. |
| 35-45 | Lists the project's API keys with `supabase projects api-keys --reveal --output json`. Without `--reveal` the CLI masks secret keys. It picks the key whose value starts with `sb_secret_` (falling back to `type === "secret"`) and requires the full `sb_secret_[A-Za-z0-9_-]+` shape, so a masked value is rejected. If no key is found, it prints the USER ACTION line and exits 1 before writing anything. |
| 47-48 | `wrangler secret list --format json` gives the set of existing secret names. The JSON is parsed from the first `[` in case wrangler prints a banner first. |
| 50-53 | Re-puts `SUPABASE_URL` and `SUPABASE_SECRET_KEY` on every run. The puts are idempotent. |
| 55-64 | `CLIENT_LINK_HMAC_KEY`: if the Worker already has one, it is **kept** (`kept CLIENT_LINK_HMAC_KEY`), because rotating it would invalidate every client link already minted (T-01-23). Otherwise a new `randomBytes(32)` hex key is put. In the kept case, a local-only key goes to `.dev.vars` with a `# local only` comment line. It only affects tokens minted on a dev machine. |
| 66-75 | `INTEGRATION_ENC_KEY` (Phase 2, D-01): the same keep-if-exists rule. Rotating it would orphan every `firm_integrations` ciphertext, so an existing Worker key is never regenerated (`kept INTEGRATION_ENC_KEY`). Otherwise a new `randomBytes(32)` hex key goes to `wrangler secret put` on stdin (`set INTEGRATION_ENC_KEY`). In the kept case a local-only key goes to `.dev.vars` with a `# local only` comment, so credentials saved by a local Worker cannot be read by production and the reverse. |
| 77-84 | Appends the missing keys to `app/.dev.vars` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `SUPABASE_PUBLISHABLE_KEY`). It never overwrites an existing line, then prints `wrote app/.dev.vars (N keys)`. |

## Output (the only lines it prints)

```
set SUPABASE_URL
set SUPABASE_SECRET_KEY
set CLIENT_LINK_HMAC_KEY      (or: kept CLIENT_LINK_HMAC_KEY)
set INTEGRATION_ENC_KEY       (or: kept INTEGRATION_ENC_KEY)
wrote app/.dev.vars (5 keys)  (0 on a re-run)
```

## Verify

`pnpm -C app wrangler secret list` shows the names `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_URL`. It never shows values.
