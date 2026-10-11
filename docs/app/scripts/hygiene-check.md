# `app/scripts/hygiene-check.sh`

Bash gate that proves PLAT-06 on a checkout: secrets and build output are git-ignored, nothing under `src/frontend/dist` is tracked, exactly one lockfile exists, the Node engine is pinned and enforced, and the 500-line gate works at the 500/501 boundary. Run it from the repo root with `bash app/scripts/hygiene-check.sh` (or `pnpm hygiene`); it prints `hygiene ok` and exits 0, or prints one `FAIL: <what>` line and exits 1.

| Lines | What it does |
|-------|--------------|
| 1-3 | `#!/usr/bin/env bash`, a header comment, and `set -eu` (exit on error and on unset variables). |
| 5 | `fail()` prints `FAIL: <message>` and exits 1, so every failing assertion names what failed instead of relying on a bare `set -e` exit. |
| 7-10 | (a) For each secret, CLI-scratch, and build-output path (`.env.local`, `app/.env`, `app/.dev.vars`, `app/dist/index.html`, `app/.wrangler/x`, `src/frontend/dist/index.html`, `supabase/.temp/x`), asserts `git check-ignore -q` succeeds. These paths need not exist; `check-ignore` evaluates the rules. |
| 12-15 | (b) For each example file (`.env.example`, `app/.env.example`, `app/.dev.vars.example`), asserts it is NOT ignored, proving the negation rules keep templates tracked. |
| 17-18 | (c) Asserts `git ls-files src/frontend/dist` lists zero tracked files. |
| 20-24 | (d) Asserts the root `pnpm-lock.yaml` exists and that `app/package-lock.json`, `app/yarn.lock`, and `app/pnpm-lock.yaml` do not — one lockfile, at the workspace root. |
| 26-28 | (e) Asserts `app/package.json` declares `"node": ">=22.12"` and `.npmrc` starts a line with `engine-strict=true`. |
| 30-31 | (f) Runs the 500-line gate over `app/`. |
| 33-40 | (g) Boundary self-test: creates a `mktemp -d` directory (removed by the `trap` on exit, including on failure), writes a 500-line `ok/a.ts` and a 501-line `bad/b.ts` with `seq`, and asserts the gate accepts the first directory and rejects the second. |
| 42-44 | (h) PLAT-03 bundle gate (Plan 05): fails with `FAIL: run pnpm -C app build before hygiene-check` if `app/dist/client` is missing, and with `FAIL: secret key in client bundle` if any file under it contains `sb_secret_`. The publishable and secret keys share the `sb_` prefix, so only the `sb_secret_` string is searched. Build first: `pnpm -C app build && bash app/scripts/hygiene-check.sh`. |
| 46 | Prints `hygiene ok`. |

## Notes

- Read-only by design: the only writes are inside the temp directory, so it can run concurrently with a build or another hygiene run.
- `.gitattributes` forces `*.sh` to LF so this script still runs on a Windows checkout with `core.autocrlf=true` (CRLF would break `bash`).
- The checked paths and the engine string are deliberately literal; if a plan changes them, change this script and this doc together.
