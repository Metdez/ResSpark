---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-10-11T02:23:48.816Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | stub | docs/app/README.md | 45 | Deployed URL placeholder '(filled by Plan 03)' until Plan 03 deploys the Worker | open |  | 2026-10-11T02:23:47.993Z |  |
| 2 | 01 | deviation | .gitattributes |  | Rule 2: added *.sh text eol=lf so hygiene-check.sh runs under core.autocrlf=true | open |  | 2026-10-11T02:23:48.816Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "01",
    "file": "docs/app/README.md",
    "line": 45,
    "description": "Deployed URL placeholder '(filled by Plan 03)' until Plan 03 deploys the Worker",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-11T02:23:47.993Z",
    "resolved_at": null,
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
  }
]
````
