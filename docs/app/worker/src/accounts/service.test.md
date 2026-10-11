# `app/worker/src/accounts/service.test.ts`

Unit tests for `service.ts`, with `db/accounts` and `auth-users` mocked.

- **signUpFirm:**
  - Calls run in order: create user, create firm, then set the `firm_id`/`admin` claim.
  - `email_exists` returns before any firm write.
  - A failed firm write deletes the new user and re-throws.
- **acceptStaffInvite:**
  - A malformed token is refused before any lookup.
  - The user is created with the invite's firm and role in `app_metadata`, and the invite is accepted with the token hash.
  - An invite that closes mid-flow deletes the user and returns `invite_invalid`.
- **Links:**
  - The invite stores only the token hash; the raw token appears only in the URL.
  - The reset URL is built from the recovery hash, or is `null` for an unknown email.
