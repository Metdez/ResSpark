# `app/src/features/auth/sign-in/components/user-auth-form.tsx`

The staff sign-in form (UI-SPEC S1, PLAT-07). Forked from shadcn-admin, then rewired: the mock `toast.promise(sleep(2000))`, the fake auth store, the social buttons, and the "Or continue with" divider are gone.

| Lines | What it does |
|-------|--------------|
| 1-25 | React state, Zod 4, React Hook Form with the Zod resolver, `isAuthRetryableFetchError` (supabase-js's "the request never reached Supabase" error), the router's `useNavigate`, the `Loader2` spinner, `sonner` toasts, the `api()` boundary with `ApiError`/`isOk`, the generic staff error copy, `safeRedirect`, the Supabase browser client, and the shadcn `Alert`, `Button`, `Form`, `Input`, and `PasswordInput` parts. |
| 27-35 | The schema. An empty email gives `Enter your email.`; any other bad email gives `That doesn't look like an email address.` (one `error` callback keyed on the input, so the empty case never shows the format message). An empty password gives `Enter your password.` There is no minimum length: the password policy belongs to Supabase, and a length hint would leak it. |
| 37-44 | The two form-level error copies from the Copywriting Contract: wrong credentials and network failure. The wrong-credentials body points to the “Forgot your password?” link under the form. |
| 46-48 | Props: the `redirectTo` search value passed by the page. |
| 50-63 | `pending` (submit in flight), `formError` (which alert to show), and the form in `mode: 'onBlur'`. `handleSubmit` also validates on submit, so errors appear on blur and on submit. |
| 65-74 | `signIn`: `supabase.auth.signInWithPassword`. supabase-js returns network failures as an `AuthRetryableFetchError` instead of throwing, so that type maps to the network alert; every other auth error (including `invalid_credentials`) maps to the wrong-credentials alert. A thrown error is treated as a network failure. Returns whether a session now exists. |
| 76-83 | `onSubmit`: ignores a second submit (Enter in a field) while pending, clears the old alert, and stops on a failed sign-in with the button re-enabled. |
| 84-95 | Posts `{ event: 'signed_in' }` to `/api/admin/session` (D-16) through `api()`, which attaches the new bearer token. A failure shows the generic staff toast with the error `code` as the muted description, then still continues, because the session exists. |
| 96 | Navigates to `safeRedirect(redirectTo)` with `replace: true`. Only `/admin…` paths survive; anything else goes to `/admin` (T-01-28). |
| 100-106 | The form. `noValidate` turns off the browser's own email bubble so the Zod copy is the only message. |
| 107-124 | Email field: label `Email`, `type="email"`, `autoComplete="username"`, `inputMode="email"`. `FormControl` sets `aria-invalid` and links the message. Long emails scroll inside the input. |
| 125-137 | Password field: `PasswordInput` with `autoComplete="current-password"`. Its toggle's accessible name is `Show password` / `Hide password`. The attribute uses double quotes so the plan's acceptance grep matches it literally. |
| 138-143 | The form-level destructive `Alert` above the button: title and body. `whitespace-normal` on the title lets long copy wrap. |
| 144-147 | The full-width `h-10` submit button, the only accent element. While pending it is disabled, shows a 16 px spinning `Loader2`, and reads `Signing in…`. The inputs stay enabled. |

## Not here, on purpose

No social sign-in and no terms footer. The "Forgot your password?" and "Create an account" links live on the page (`sign-in/index.tsx`), not in this form. Accounts come from public sign-up (a new firm, `/admin/sign-up`), from an admin's invite (Settings → Team), or from `app/scripts/create-staff.mjs`. Supabase's own public sign-up endpoint stays off: the Worker creates every account with the service key.
