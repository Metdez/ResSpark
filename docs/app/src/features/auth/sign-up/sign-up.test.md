# `app/src/features/auth/sign-up/sign-up.test.tsx`

The router (`useNavigate`, `Link`) and `@/lib/supabase` are mocked; `fetch` answers from the `renderWithQuery` table.

- **Happy path:** the posted body carries all four fields. Sign-in uses the email the Worker returned (lowercased), and the page replace-navigates to `/admin`.
- **409 `email_exists`:** shows "already exists" and never signs in.
- **Short password:** the zod message ("at least 10 characters") shows, and no request is sent.
