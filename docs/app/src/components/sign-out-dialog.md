# `app/src/components/sign-out-dialog.tsx`

The sign-out confirmation (UI-SPEC S4, D-16). Opened from `nav-user.tsx` and `profile-dropdown.tsx`.

| Lines | What it does |
|-------|--------------|
| 1-8 | React state, `useQueryClient`, `useNavigate`, `sonner` toasts, `ApiError`, the generic staff error copy, `signOutEverywhere`, and the shared `ConfirmDialog` (an `AlertDialog`). |
| 10 | Product name from `VITE_APP_NAME`, falling back to `ResSpark`. |
| 12-15 | Props: controlled `open` and `onOpenChange`. |
| 18-21 | Router, query client, and `pending` (disables both buttons while signing out). |
| 23-27 | `handleSignOut`: `signOutEverywhere()` posts `{ event: 'signed_out' }` first, while the token is valid, then signs out locally. It never throws. |
| 28-32 | If the event post failed, shows the generic staff toast with the error `code` as the muted description. The user is signed out anyway (never trapped in a session). |
| 33 | Navigates to `/admin/sign-in` with `replace`, so Back does not return to the shell. No `redirect` is kept: the user chose to leave. |
| 34-35 | Clears the query cache **after** leaving the shell. Clearing first would make the still-mounted session query refetch without a token, get a 401, and show "Your session ended". |
| 38-49 | `ConfirmDialog`: title `Sign out of {app name}?`, body `You'll need your email and password to sign in again.`, confirm `Sign out` in the default variant (signing out is not destructive), cancel `Cancel`. Radix `AlertDialog` puts initial focus on Cancel. |
