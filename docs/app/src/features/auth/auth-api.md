# `app/src/features/auth/auth-api.ts`

Client calls for the public account endpoints (`/api/auth/*`, see `worker/src/routes/auth-public.md`), the form rules they share, and the sign-in step every account flow ends with.

| Export | What it does |
|---|---|
| `passwordSchema` | Zod rule mirroring the Worker: at least 10 characters and at most 72 UTF-8 bytes. |
| `emailSchema` | Zod email rule with the same wording as the sign-in form ("Enter your email." / "That doesn't look like an email address."). |
| `InviteInfo` / `isInviteInfo` | Shape and guard for `GET /api/auth/invite`. Every response is checked before use. |
| `signUp(input)` | `POST /api/auth/sign-up`. Resolves to `{ ok, email }` with the normalized email. |
| `getInvite(token)` | `GET /api/auth/invite?token=…`, with the token URL-encoded. |
| `acceptInvite(input)` | `POST /api/auth/accept-invite`. Resolves to `{ ok, email }`. |
| `requestPasswordReset(email)` | `POST /api/auth/forgot-password`. |
| `signInAndRecord(email, password)` | Signs in with Supabase, then posts `signed_in` to `/api/admin/session` (D-16 audit). A failed sign-in throws a plain `Error('sign_in_failed')`, not an `ApiError` 401, so the app-wide handler does not treat it as an expired session. A failed event post is swallowed, because the session already exists. |
| `accountErrorText(error)` | Fixed sentence for each Worker code (`email_exists`, `weak_password`, `invalid_email`, `invalid_name`, `invalid_firm_name`, `invite_invalid`, `rate_limited`). Anything else gets the "Couldn't reach ResSpark" line. |

All calls go through `api()` in `lib/api.ts`. It adds a bearer token only when a session already exists; the public endpoints ignore it.
