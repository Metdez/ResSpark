# `app/scripts/supabase-config-push.mjs`

Pushes `supabase/config.toml` to the live project. Today that file holds one setting, `auth.enable_signup = false`. Run it with `pnpm -C app auth:config-push`. It needs no env file: the CLI uses its stored login.

| Lines | What it does |
|-------|--------------|
| 1 | Header and run command. |
| 2-5 | `node:` built-ins plus `PROJECT_REF`, `getWorkdir`, and `runSupabase` from `lib/supabase-cli.mjs`. |
| 7 | `CONFIG`: the absolute path of the tracked `supabase/config.toml`. |
| 9-11 | The CLI always runs in a temp workdir, because it cannot parse the repo-root env file. The script creates `<workdir>/supabase/` there and copies the config in, so `config push` finds it. |
| 13-15 | Runs `supabase config push --project-ref <ref> --yes` and prints the CLI's stdout. That output is a per-service diff and a JSON summary, with no secrets. `--yes` is the CLI's global flag that answers the per-resource confirmation prompt in a non-interactive run. Without it, piped runs skip every change. |
| 16-22 | On failure it prints the dashboard fallback (`USER ACTION REQUIRED: … turn off "Allow new users to sign up"`), prints the error message (command name and exit code only), and exits 1. |

Proof that the setting is live: `app/worker/test/signup-disabled.test.ts`.
