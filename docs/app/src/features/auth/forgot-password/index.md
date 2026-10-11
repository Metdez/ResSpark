# `app/src/features/auth/forgot-password/index.tsx`

The `/admin/forgot-password` page. The Worker answers the same way whether or not the account exists, so this page does too.

| Part | What it does |
|---|---|
| `schema` | One email field (`emailSchema`). |
| `backToSignIn` | Footer link back to `/admin/sign-in`. |
| `onSubmit` | `requestPasswordReset(email)`, then switches to the "Check your email" state. A network or rate-limit error shows in an inline `Alert`. |
| "Check your email" state | "If an account exists for {email}, we sent a link… It works once and expires in one hour." A second line says that if no email arrives, a firm admin can make a reset link from Settings → Team. That is the fallback while Cloudflare Email Service has no sending domain (`EMAIL_FROM` empty). |
| Form state | Title "Reset your password", the email field, and "Send reset link" (spinner and "Sending…" while pending). |

Tests: `forgot-password.test.tsx` (see `forgot-password.test.md`).
