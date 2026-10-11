# `app/src/features/auth/sign-in/index.tsx`

The `/admin/sign-in` page body (UI-SPEC S1). It replaced the fork's `AuthLayout` wrapper, which was deleted because nothing else used it.

| Part | What it does |
|------|--------------|
| Imports | `Link` and `useSearch` from the router, the shared `AuthCard` frame (`features/auth/auth-card.tsx`, which holds the backdrop, card and brand line this page used to draw itself), and `UserAuthForm`. |
| `appName`, `link` | Product name from `VITE_APP_NAME` (falling back to `ResSpark`), and the shared link style. |
| `redirect` | Typed `redirect` search param from the `/admin/sign-in` route. |
| `AuthCard` props | Title `Sign in to {app name}`, the subtitle `Staff access for {app name}.`, and a footer "New to {app name}? Create an account" linking to `/admin/sign-up`. |
| Body | The form, given the raw `redirect` (the form sanitises it with `safeRedirect`), then a centered "Forgot your password?" link to `/admin/forgot-password`. |

The old subtitle ("Accounts are created by your admin.") was dropped when public sign-up and invites were added. Accounts now come from sign-up (a new firm) or from an admin's invite (Settings → Team).
