# `app/worker/test/accounts-live.test.ts`

Live proof of the staff-account flows against the real Supabase project, run in the automated test firm `00000000-0000-0000-0000-00000000000e` only. Run with:

```
pnpm -C app run test:live:file worker/test/accounts-live.test.ts
```

The suite is skipped without `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY`. `RESEND_API_KEY` is blanked in the test env, so nothing is emailed to the fake `@resspark.test` addresses.

**Setup:** ensures the test firm exists, creates an admin "inviter" user with a profile in it, and signs that user in.

**Cases:**
1. The admin invites through `POST /api/admin/team/invites`. The answer has a join URL with a 43-character token and `email_status: not_configured`, and the stored hash does not contain the token.
2. `GET /api/auth/invite` describes the invite with the firm name.
3. `POST /api/auth/accept-invite` creates the account. It signs in with `app_metadata` `{ firm_id: test firm, role: staff }`, and the real `staffAuth` accepts its token on `/api/admin/session`.
4. The same invite link is refused the second time (404).
5. `GET /api/admin/team` lists the new member.
6. Password reset:
   - `passwordResetUrl` gives a recovery token hash.
   - `verifyOtp({ token_hash, type: 'recovery' })` plus `updateUser` changes the password.
   - The old password stops working, the new one works, and the token cannot be used twice.
7. **Opt-in, `LIVE_SIGNUP=1`:** public sign-up creates a new firm whose first user is its admin, and a second sign-up with the same email gets 409. Each run leaves one firm row, pinned by its append-only `firm.created` event, which is why it is opt-in.
8. A revoked invite's link answers 404.

**Cleanup:** deletes every auth user the run created (matched by the run's random tag) and the run's invites. Events stay (append-only).
