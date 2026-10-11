# `app/worker/src/routes/admin-team.ts`

The Team API for Settings → Team, mounted at `/api/admin/team`. Every route runs `staffAuth`, so the firm and role come only from the verified JWT. Every write is admin-only (`requireAdmin` → 403 `forbidden`).

| Route | Who | What it does |
|---|---|---|
| `GET /` | any staff | `{ members, invites, can_manage, you }`. `members` joins `staff_profiles` with each user's email and last sign-in (`authUserInfo`). `invites` lists open invites for admins and is empty for staff. `you` is the caller's user id, so the page can hide actions on yourself. |
| `POST /invites` | admin | Body `{ email, role }`. Returns 400 `invalid_email` / `bad_request`, or 409 `already_member` when the address already belongs to a member of this firm. Otherwise creates the invite (`inviteStaff`), emails it (`sendInviteEmail`), and returns `{ id, email, role, expires_at, url, email_status }`. The link comes back to the admin, so an invite works before email delivery is set up. |
| `DELETE /invites/:id` | admin | Revokes an open invite of this firm. Returns 404 when nothing matched and 400 for a non-UUID id. Logs `staff.invite_revoked`. |
| `POST /members/:userId/reset-link` | admin | Makes a one-hour, one-time password-reset link for a member of this firm (404 otherwise) and returns `{ url }`. Logs `staff.reset_link_created` with the target user id. This is the working reset path while email is not configured. |

**Helpers:**
- `uuidParam` validates path ids.
- `staffEvent` writes the audit event with the caller as actor.
- `members` builds the joined member list used by `GET`, the duplicate check and the reset-link lookup.

Tests: `admin-team.test.ts` (see `admin-team.test.md`).
