# `app/src/features/auth/sign-up/index.tsx`

The `/admin/sign-up` page. Public sign-up creates a new, empty firm with this person as its admin, then signs them in.

| Part | What it does |
|---|---|
| `schema` | Your name (1–100), firm name (1–120), work email (`emailSchema`) and password (`passwordSchema`). Validated on blur and on submit. |
| `onSubmit` | Three steps (below). |
| `AuthCard` | Title "Create your ResSpark account", a subtitle saying they become the firm's admin and can invite their team, and a footer linking to sign-in. |
| Form | Four `AuthField`s, an inline destructive `Alert` for server errors, and a full-width submit button that shows a spinner and "Creating account…" while pending. |

**`onSubmit` steps:**
1. `signUp`.
2. `signInAndRecord` with the email the Worker returned (normalized to lowercase).
3. Replace-navigates to `/admin`.

Any error becomes `accountErrorText`. For example, `email_exists` reads "An account with this email already exists. Sign in, or reset your password."

Tests: `sign-up.test.tsx` (see `sign-up.test.md`).
