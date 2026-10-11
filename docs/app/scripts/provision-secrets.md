# `app/scripts/provision-secrets.mjs`

Puts the Worker secrets on `resspark` and fills the git-ignored `app/.dev.vars` for local runs (D-07, PLAT-03, D-15). No secret value is ever printed. Values go to `wrangler secret put` on stdin and are written only to `app/.dev.vars`.

There are two modes:

- `pnpm -C app secrets:provision` puts the five required secrets.
- `pnpm -C app secrets:provider plaid` (or `truv`) prompts for one provider's vendor keys.

Both scripts wrap the file in `dotenv -e ../.env -e ../src/frontend/.env`. The first file gives wrangler its Cloudflare token. The second gives `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

| Lines | What it does |
|-------|--------------|
| 1-5 | Header. The rule: never `console.log` a variable that holds a value from this script, prompted values included. Printed lines name a secret, never its value. |
| 6-12 | `node:` built-ins (`readline/promises` and `stream` for the muted prompt), the `.dev.vars` helper, and `runSupabase` / `PROJECT_REF` from `lib/supabase-cli.mjs`. The Supabase CLI always runs from a temp dir, because it cannot parse the repo-root env file. |
| 14-17 | `APP_DIR` (wrangler needs it as its cwd to find `wrangler.jsonc`), the exact `USER ACTION REQUIRED` text (with the manual `wrangler secret put` command for all five required secrets), and `PROVIDERS`, which maps `plaid` and `truv` to their two secret names. |
| 19-22 | `requireEnv(name)` throws `Missing <name>`. The message carries the name only, never a value. |
| 24-35 | `wrangler(args, input)` spawns `npx wrangler <args>` through the shell (`npx` is a `.cmd` on Windows) with `cwd: APP_DIR`. `input` becomes stdin; when stdin is not a TTY, `wrangler secret put NAME` reads the value from it, so the value never appears in argv or the process list. stdout is captured and never echoed. A non-zero exit throws with the argument names only. |
| 37-55 | `readValues(names)` returns one value per name. **Piped stdin** (not a TTY): reads all of it and splits on line breaks, one line per name in order. **Terminal**: one `readline/promises` interface whose `output` is a `Writable` that drops everything, so the characters the operator types are never echoed. Each prompt `NAME: ` is written to stderr, and a newline follows each answer. |
| 57-76 | `--provider <plaid\|truv>` mode, which runs before any Supabase work. An unknown provider prints the usage line and exits 1. For each name, an empty value prints `skipped <NAME>`. Otherwise the value goes to `wrangler secret put <NAME>` on stdin and the script prints `set <NAME>`. The entered values are then appended to `app/.dev.vars`, but only for keys not already there. It prints `wrote app/.dev.vars (N keys)` and exits 0. It never generates a value, never prints one, and never passes one on argv. |
| 78-79 | Reads the Supabase URL and publishable key from the environment. |
| 81-91 | Lists the project's API keys with `supabase projects api-keys --reveal --output json`; without `--reveal` the CLI masks secret keys. It picks the key whose value starts with `sb_secret_` (falling back to `type === "secret"`) and requires the full `sb_secret_[A-Za-z0-9_-]+` shape, so a masked value is rejected. With no key found, it prints the USER ACTION line and exits 1 before writing anything. |
| 93-94 | `wrangler secret list --format json` gives the set of secret names that already exist. The JSON is parsed from the first `[` in case wrangler prints a banner first. |
| 96-99 | Re-puts `SUPABASE_URL` and `SUPABASE_SECRET_KEY` on every run. The puts are idempotent. |
| 101-110 | `CLIENT_LINK_HMAC_KEY`. If the Worker already has one, it is **kept** (`kept CLIENT_LINK_HMAC_KEY`), because rotating it would invalidate every client link already minted (T-01-23). Otherwise a new `randomBytes(32)` hex key is put. In the kept case, a local-only key goes to `.dev.vars` with a `# local only` comment line; it only affects tokens minted on a dev machine. |
| 112-121 | `INTEGRATION_ENC_KEY` (Phase 2, D-01) follows the same keep-if-exists rule. Rotating it would orphan every `firm_integrations` ciphertext. |
| 123-132 | `TOKEN_ENC_KEY_1` (Phase 4, D-15) follows the same keep-if-exists rule. Rotating it would orphan every `connection_secrets` ciphertext, the sealed Plaid access tokens. A key rotation would add `TOKEN_ENC_KEY_2` alongside it rather than replace it (`key_version` column). |
| 134-end | Appends the missing keys to `app/.dev.vars` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `TOKEN_ENC_KEY_1`, `SUPABASE_PUBLISHABLE_KEY`). It never overwrites an existing line, then prints `wrote app/.dev.vars (N keys)`. |

## Output (the only lines it prints)

`secrets:provision`:

```
set SUPABASE_URL
set SUPABASE_SECRET_KEY
set CLIENT_LINK_HMAC_KEY      (or: kept CLIENT_LINK_HMAC_KEY)
set INTEGRATION_ENC_KEY       (or: kept INTEGRATION_ENC_KEY)
set TOKEN_ENC_KEY_1           (or: kept TOKEN_ENC_KEY_1)
wrote app/.dev.vars (N keys)  (0 on a re-run)
```

`secrets:provider truv` (prompts `TRUV_CLIENT_ID: ` and `TRUV_SECRET: ` on stderr, with echo off):

```
set TRUV_CLIENT_ID            (or: skipped TRUV_CLIENT_ID when left empty)
set TRUV_SECRET
wrote app/.dev.vars (N keys)
```

## Verify

`pnpm -C app wrangler secret list` shows names only, never values: `CLIENT_LINK_HMAC_KEY`, `INTEGRATION_ENC_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL`, `TOKEN_ENC_KEY_1`, plus the vendor keys once they are entered.
