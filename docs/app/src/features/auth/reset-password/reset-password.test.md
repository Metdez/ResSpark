# `app/src/features/auth/reset-password/reset-password.test.tsx`

The router, Supabase (`verifyOtp`, `updateUser`) and `sonner` are mocked.

- `verifyOtp` is not called on load. On submit it gets `{ token_hash, type: 'recovery' }`; then `updateUser` saves the password and the page navigates.
- An expired or used token shows the expired message, and the password is not updated.
- Mismatched passwords are caught before the token is used.
- With no token, the expired message shows and the button is disabled.
