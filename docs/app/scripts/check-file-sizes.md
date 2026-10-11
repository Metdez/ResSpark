# `app/scripts/check-file-sizes.mjs`

Dependency-free Node script that fails when any code file under a directory has more than 500 lines. It is the first step of `pnpm -C app check` and step (f) of `app/scripts/hygiene-check.sh`.

| Lines | What it does |
|-------|--------------|
| 1-3 | Imports from `node:fs`, `node:path`, and `node:url` only; no third-party packages. |
| 5 | `MAX_LINES = 500` — the CLAUDE.md limit. |
| 6 | `SKIP_DIRS` — directory names never entered: `node_modules`, `dist`, `.wrangler`, `.git`. |
| 7 | `CODE_EXTENSIONS` — only `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs` files are counted. |
| 8-9 | `SKIP_PATHS` — the only exclusions: generated `routeTree.gen.ts` and `worker-configuration.d.ts`, and vendored `src/components/ui/`. The `shortcut:` comment records why `ui/` is excluded (shadcn's `sidebar.tsx` is 728 lines) and when to undo it (the first time a file there is edited). |
| 11 | Resolves the script's own directory from `import.meta.url`. |
| 12-13 | Finds an optional `--root <dir>` argument; throws if the flag is given without a value. |
| 14 | `root` is the `--root` value or, by default, the `app/` directory (the script's parent). |
| 16-21 | `walk(directory)` lists entries with `withFileTypes`, recurses into directories not in `SKIP_DIRS`, and returns regular files only (symlinks and other entry types are ignored). |
| 23-26 | `countLines(text)` counts line breaks and adds one for a trailing unterminated line, so an empty file is 0, 500 terminated lines are 500, and 501 lines are 501. CRLF files count the same because only `\n` is counted. |
| 28-34 | Builds `offenders`: every file under `root`, made root-relative with `/` separators (so the skip patterns match on Windows too), filtered by extension and skip patterns, paired with its line count, kept if over `MAX_LINES`, and sorted by path with plain code-point comparison so the output is identical across runs and machines. |
| 36-39 | If any offender exists, prints `path: N lines` per file to stderr and exits 1. Otherwise prints nothing and exits 0. |

## Notes

- Run as `node app/scripts/check-file-sizes.mjs` from the repo root, or `node app/scripts/check-file-sizes.mjs --root <dir>` to check another tree (the hygiene self-test uses this with temp directories).
- Do not add exclusions beyond the three above; the 500-line rule is a project requirement, not a tunable.
- A non-existent root makes `readdirSync` throw, which is the intended fail-fast behaviour (same style as `src/frontend/scripts/generate-counties.mjs`).
