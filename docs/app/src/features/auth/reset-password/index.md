# `app/src/features/auth/reset-password/index.tsx`

The `/admin/reset-password?token_hash=…` page. Both the emailed link and the admin-copied link from Settings → Team land here.

| Part | What it does |
|---|---|
| `schema` | New password (`passwordSchema`) and a confirmation that must match ("The passwords don't match." on the confirm field). |
| `EXPIRED` | "This reset link has expired or was already used." Shown at once when the URL has no `token_hash`; the submit button is then disabled. |
| `onSubmit` | Two steps (below). |
| Footer | "Need a new link?" goes to `/admin/forgot-password`. |

**`onSubmit` steps:**
1. `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`, which turns the one-time token into a session. On failure, shows `EXPIRED`.
2. `supabase.auth.updateUser({ password })`. On failure, shows "Couldn't save the new password". On success, a toast says "Password updated" and the page replace-navigates to `/admin`.

**Why the token is verified on submit, not on page load:** a reload, or an email client's link preview, would otherwise use up the one-time token before the person picks a password.

Tests: `reset-password.test.tsx` (see `reset-password.test.md`).
