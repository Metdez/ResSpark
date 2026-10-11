# `app/worker/src/routes/admin-team.test.ts`

Route tests with `staffAuth` replaced by a fixed staff context (admin by default). The db, auth-users, service, email and events modules are mocked.

- **GET:**
  - An admin gets members with their emails and last sign-in, the open invites, `can_manage: true`, and `you`.
  - Staff get no invites, and the invite query is not run.
- **Invite:**
  - Uses the caller's firm and user id and the request origin, and emails with the firm and inviter names.
  - Returns the URL and `email_status`.
  - Staff get 403.
  - Bad email, bad role and an existing member (matched case-insensitively) are refused.
- **Revoke:**
  - 200 and an audit event when an invite matched; 404 when none did; 400 for a non-UUID id.
- **Reset link:**
  - Built for a member of the firm from that member's email.
  - 404 for a user outside the firm.
