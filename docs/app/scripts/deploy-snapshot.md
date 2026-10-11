# app/scripts/deploy-snapshot.mjs

Deploys the **last commit** of the current branch to the Cloudflare Worker, ignoring uncommitted work in the checkout.

## Why it exists

Several executors work in the same checkout at once and always have half-finished, uncommitted files. `pnpm -C app run deploy` builds from the working tree, so it would ship that work. This script builds from a clean copy of `HEAD` instead.

## How to run

```
pnpm -C app run deploy:snapshot
```

The `deploy:snapshot` script in `app/package.json` loads the repo-root env file and `src/frontend/.env` with `dotenv`, then runs this script. The script inherits those variables (the Cloudflare token for `wrangler`, the `VITE_*` values for the SPA build). It never reads an env file itself.

## What it does, line by line

| Lines | What |
|---|---|
| 1–4 | Header comment: why the script deploys a commit and how it gets its env. |
| 5–7 | Node built-ins only: `spawnSync`, `existsSync`/`rmSync`, path helpers. |
| 9–11 | `root` is the repo root; the snapshot lives at `.claude/worktrees/deploy-snapshot` (git-ignored). `win` switches Windows-specific behaviour. |
| 13–17 | `run()` spawns a command with inherited stdio and throws on a non-zero exit. Only `pnpm` gets a shell on Windows (it is a `.cmd`); `git` runs without one so the repo path, which contains a space, is not split. |
| 19–27 | `remove()` deletes any old snapshot: `git worktree remove --force`, then `cmd /c rmdir /s /q` on Windows (it does not follow pnpm's `node_modules` junctions into the shared store) or `rmSync` elsewhere, then `git worktree prune`. |
| 29–30 | Prints the short commit id being deployed. |
| 31 | Removes any leftover snapshot from a failed earlier run. |
| 32–37 | Adds a detached worktree at `HEAD`, installs dependencies from the frozen root lockfile, type-checks with `tsc -b`, then runs `deploy:raw` (`vite build && wrangler deploy`) inside the snapshot. |
| 38–40 | Always removes the snapshot, whether the deploy succeeded or failed. |

## Notes

- Tests are not run here; run `pnpm -C app run check` on the commit first if you need the full gate.
- If the auto-mode classifier or a permission prompt blocks the deploy, run the command yourself; never route around it.
