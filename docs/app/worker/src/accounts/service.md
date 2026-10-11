# `app/worker/src/accounts/service.ts`

The account flows. Each one creates the auth user first, because the Auth admin API sits outside any SQL transaction. It then writes the firm and profile in one RPC, and deletes the user if a later step fails.

| Export | What it does |
|---|---|
| `INVITE_TTL_DAYS` = 7 | How long an invite link stays open. |
| `AccountResult` | `{ ok: true, userId, firmId, email }`, or `{ ok: false, code }` where `code` is `email_exists`, `weak_password` or `invite_invalid`. |
| `signUpFirm(env, { email, password, name, firmName })` | Public sign-up, in three steps (below). |
| `openInviteForToken(env, token)` | Returns `null` when the token is malformed (`INVITE_TOKEN_SHAPE`), unknown, used, revoked or expired, so callers cannot tell these cases apart. Otherwise returns the open invite and the token hash. |
| `acceptStaffInvite(env, { token, name, password })` | Invite acceptance, in three steps (below). |
| `inviteStaff(env, { firmId, email, role, invitedBy, origin })` | Mints a token, stores only its hash through `staff_invite_create`, and returns `{ id, expires_at, url }`. The URL is `<origin>/admin/join?token=<raw token>`. |
| `passwordResetUrl(env, email, origin)` | `<origin>/admin/reset-password?token_hash=<hash>` from `recoveryTokenHash`, or `null` when there is no account. |

**`signUpFirm` steps:**
1. Creates the user with no `app_metadata`.
2. Calls `firm_create_with_admin`.
3. Sets `app_metadata` to `{ firm_id, role: 'admin' }` last. `staffAuth` requires that claim to match the profile, so until this step the user can reach nothing.

If step 2 or 3 throws, the user is deleted and the error is re-thrown. A firm row written before a failed step 3 stays behind; its `firm.created` event pins it.

**`acceptStaffInvite` steps:**
1. Looks up the open invite.
2. Creates the user with the invite's `firm_id` and `role` in `app_metadata`.
3. Calls `staff_invite_accept`.

If step 3 reports `invite_invalid` (the invite was revoked, used or expired in between), the user is deleted and `invite_invalid` is returned.

Tests: `service.test.ts` (see `service.test.md`).
