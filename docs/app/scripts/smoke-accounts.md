# `app/scripts/smoke-accounts.mjs`

Staff-account checks for `smoke.mjs`, split out to keep `smoke.mjs` under 500 lines. `accountChecks({ base, expectJson, isObject })` returns three checks that create nothing on the deployed Worker:

| Check | Expects |
|---|---|
| `team 401 without token` | `GET /api/admin/team` → 401 `unauthorized`. |
| `unknown invite 404` | `GET /api/auth/invite?token=<43 x>` → 404 `invite_invalid`. |
| `sign-up refuses a weak password` | `POST /api/auth/sign-up` with a 5-character password → 400 `weak_password`. Validation runs before any write, so no account or firm is created. |

`code(expected)` builds the error-envelope test passed to `expectJson`.
