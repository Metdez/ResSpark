# `app/src/features/auth/sign-in/index.tsx`

The `/admin/sign-in` page body (UI-SPEC S1). It replaced the fork's `AuthLayout` wrapper, which was deleted because nothing else used it.

| Lines | What it does |
|-------|--------------|
| 1-3 | `useSearch`, the shadcn `Card`, and `UserAuthForm`. |
| 5 | Product name from `VITE_APP_NAME`, falling back to `ResSpark`. |
| 8-9 | Reads the typed `redirect` search param from the `/admin/sign-in` route. |
| 12 | Full-viewport `bg-muted/40` backdrop. Its height subtracts the 36 px SANDBOX banner (rendered above it by `routes/admin/route.tsx`), so the page does not scroll. |
| 13 | The card: 384 px wide (`w-96`, never wider than the screen), 24 px padding, `rounded-lg`, 1 px border, `shadow-sm`. |
| 14 | App title in the Heading role (20 px, 600) and the accent color (`text-brand`). |
| 15-22 | Display title `Sign in to {app name}` and the muted subtitle `Staff access for {app name}. Accounts are created by your admin.` The firm name will replace the product name in Phase 2. |
| 23 | The form, given the raw `redirect`; the form sanitises it with `safeRedirect`. |
