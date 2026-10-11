# `app/src/features/auth/join/join.test.tsx`

The router (`useSearch`, `useNavigate`, `Link`) and Supabase are mocked.

- **Open invite:** the firm and email show. The accept body is `{ token, name, password }`, then sign-in with the returned email and navigation.
- **404 invite:** shows "no longer valid" and no form.
- **No token:** shows the same message without any request.
