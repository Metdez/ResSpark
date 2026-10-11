# `app/worker/src/routes/auth-public.ts`

Public (no session) account endpoints, mounted at `/api/auth` in `worker/src/index.ts`. Answers carry fixed codes only. Emails and passwords are never logged: the logger records method, path, status and error code.

## Guard middleware (every route)

1. Sets `Cache-Control: no-store`.
2. Refuses a `POST` whose content type is not `application/json` with 415 `unsupported_media_type`. A cross-site HTML form cannot send JSON without a CORS preflight, and the Worker answers none, so other sites cannot post here.
3. Per-IP throttle under the key `auth:<ip>`. It uses the `LINK_RATE_LIMITER` binding (20 per 60 s) when present, otherwise the in-memory `allowInWindow` window with the same numbers. Over the limit, it returns 429 `rate_limited`. The IP is a counter key only.

## Routes

| Route | Body | Answers |
|---|---|---|
| `POST /sign-up` | `email`, `password`, `name`, `firm_name` | 200 `{ ok, email }` (normalized email) · 400 `invalid_email` / `weak_password` / `invalid_name` / `invalid_firm_name` · 409 `email_exists`. Calls `signUpFirm`. |
| `GET /invite?token=` | — | 200 `{ email, role, firm_name, expires_at }` · 404 `invite_invalid` for any token that is not open. |
| `POST /accept-invite` | `token`, `name`, `password` | 200 `{ ok, email }` · 400 `weak_password` / `invalid_name` · 404 `invite_invalid` · 409 `email_exists` (the address already has an account). |
| `POST /forgot-password` | `email` | 200 `{ ok: true }` whether or not the account exists (no account enumeration) · 400 `invalid_email`. |

`refused(code)` maps service codes to statuses: `invite_invalid` → 404, `weak_password` → 400, anything else → 409.

## How `/forgot-password` sends

- At most 3 links per address per 15 minutes (`forgot:<email>` window), which stops email bombing. Requests past that limit get the same 200 and send nothing.
- When an account exists, the reset URL is built from the request origin and sent with `sendPasswordResetEmail`.
- Until a sending domain is onboarded in Cloudflare Email Service (`EMAIL_FROM` set), nothing is sent. The page tells the person to ask an admin, who can copy a reset link from Settings → Team.

Tests: `auth-public.test.ts` (see `auth-public.test.md`).
