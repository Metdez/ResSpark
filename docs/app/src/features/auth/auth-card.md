# `app/src/features/auth/auth-card.tsx`

The UI-SPEC S1 frame shared by sign-in, sign-up, join, forgot-password and reset-password. It replaces the markup that used to live only in the sign-in page.

| Part | What it does |
|---|---|
| `appName` | `VITE_APP_NAME`, falling back to `ResSpark`. |
| `<main>` | Full-viewport `bg-muted/40` backdrop. Its height subtracts the 36 px SANDBOX banner that `routes/admin/route.tsx` renders above it, so the page does not scroll. |
| `<Card>` | 384 px wide (`w-96`, never wider than the screen), 24 px padding, `rounded-lg`, border, `shadow-sm`. |
| Brand line | App name in the Heading role and the accent color (`text-brand`). |
| `title` / `description` | The page's `h1`, plus an optional muted subtitle (any React node, so a page can bold an email inside it). |
| `children` | The page's form or message. |
| `footer` | Optional centered muted line, used for links such as "Create an account" and "Back to sign in". |
