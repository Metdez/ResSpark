# `app/worker/src/accounts/auth-users.ts`

Thin wrappers over the Supabase Auth admin API, called with the service key (server side only). Authorization data goes in `app_metadata` only, never `user_metadata`, which users can edit.

| Export | What it does |
|---|---|
| `CreateUserResult` | `{ ok: true, id }`, or `{ ok: false, reason }` where `reason` is `email_exists`, `weak_password` or `failed`. |
| `createAuthUser(env, { email, password, appMetadata? })` | `auth.admin.createUser` with `email_confirm: true`, because the Worker vouches for the address. Maps the error codes `email_exists` / `user_already_exists` and `weak_password`; anything else is `failed`. A `shortcut:` comment notes that public sign-up does not yet prove email ownership. |
| `setAppMetadata(env, userId, appMetadata)` | `auth.admin.updateUserById`. Throws `app_metadata_failed` on error. |
| `deleteAuthUser(env, userId)` | Compensation step when a later write fails. Its `staff_profiles` row goes with it (`ON DELETE CASCADE`). |
| `recoveryTokenHash(env, email)` | `auth.admin.generateLink({ type: 'recovery' })`. Returns `properties.hashed_token`, or `null` when no account has the email. `generateLink` sends no email itself. |
| `AuthUserInfo` / `authUserInfo(env, ids)` | Email and last sign-in for each user id, one `getUserById` call per id run in parallel. A `shortcut:` comment marks the point (about 100 staff) where this should move to SQL. |
