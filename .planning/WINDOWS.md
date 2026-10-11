---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 2
total_count: 6
last_updated: 2026-10-11T06:36:20.919Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | docs/app/README.md | 45 | Deployed URL placeholder '(filled by Plan 03)' until Plan 03 deploys the Worker | fixed |  | 2026-10-11T02:23:47.993Z | 2026-10-11T04:04:28.236Z |
| 2 | 01 | deviation | .gitattributes |  | Rule 2: added *.sh text eol=lf so hygiene-check.sh runs under core.autocrlf=true | open |  | 2026-10-11T02:23:48.816Z |  |
| 3 | 01 | stub | app/src/components/profile-dropdown.tsx | 26 | Header profile dropdown still shows the fork's placeholder avatar/name/email (satnaing); Plan 06 wires the signed-in staff user | fixed |  | 2026-10-11T03:04:20.204Z | 2026-10-11T05:59:29.142Z |
| 4 | 01 | stub | app/src/features/auth/sign-in/components/user-auth-form.tsx | 56 | Sign-in form still uses the fork's mock toast.promise(sleep) auth and zustand auth-store; Plan 06 replaces with Supabase Auth | open |  | 2026-10-11T03:04:21.068Z |  |
| 5 | 01 | deviation | app/.env.example |  | app/.env was not created: the auto-mode classifier blocked both the heredoc and the scratchpad script that copy src/frontend/.env; human must copy it and append VITE_APP_NAME=ResSpark before pnpm -C app dev needs Supabase | open |  | 2026-10-11T03:04:21.992Z |  |
| 6 | 01 | unrun-verify | app/src/features/client-link/client-shell.tsx |  | 01-07 Task 3 human-check pending: /c/ and /c/not-a-valid-token at 320 px width and 200% zoom (no horizontal scroll, text >= 16 px, firm name one line, tab title = firm name) | open |  | 2026-10-11T06:36:20.919Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "01",
    "file": "docs/app/README.md",
    "line": 45,
    "description": "Deployed URL placeholder '(filled by Plan 03)' until Plan 03 deploys the Worker",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-11T02:23:47.993Z",
    "resolved_at": "2026-10-11T04:04:28.236Z",
    "milestone": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": ".gitattributes",
    "line": null,
    "description": "Rule 2: added *.sh text eol=lf so hygiene-check.sh runs under core.autocrlf=true",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-11T02:23:48.816Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "stub",
    "phase": "01",
    "file": "app/src/components/profile-dropdown.tsx",
    "line": 26,
    "description": "Header profile dropdown still shows the fork's placeholder avatar/name/email (satnaing); Plan 06 wires the signed-in staff user",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-11T03:04:20.204Z",
    "resolved_at": "2026-10-11T05:59:29.142Z",
    "milestone": null
  },
  {
    "id": 4,
    "kind": "stub",
    "phase": "01",
    "file": "app/src/features/auth/sign-in/components/user-auth-form.tsx",
    "line": 56,
    "description": "Sign-in form still uses the fork's mock toast.promise(sleep) auth and zustand auth-store; Plan 06 replaces with Supabase Auth",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-11T03:04:21.068Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "01",
    "file": "app/.env.example",
    "line": null,
    "description": "app/.env was not created: the auto-mode classifier blocked both the heredoc and the scratchpad script that copy src/frontend/.env; human must copy it and append VITE_APP_NAME=ResSpark before pnpm -C app dev needs Supabase",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-11T03:04:21.992Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "app/src/features/client-link/client-shell.tsx",
    "line": null,
    "description": "01-07 Task 3 human-check pending: /c/ and /c/not-a-valid-token at 320 px width and 200% zoom (no horizontal scroll, text >= 16 px, firm name one line, tab title = firm name)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-11T06:36:20.919Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
