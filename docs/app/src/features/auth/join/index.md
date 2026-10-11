# `app/src/features/auth/join/index.tsx`

The `/admin/join?token=…` invite landing page.

| Part | What it does |
|---|---|
| `schema` | Name (1–100) and password (`passwordSchema`). The email is fixed by the invite. |
| `Join` | Loads the invite with `getInvite(token)` through React Query. `retry: false`, and `meta.errorShown` so the app-wide error toast stays quiet; the card below is the error message. It renders one of three states (below). |
| `JoinForm` | Two steps on submit (below). |

**`Join` states:**
- **No token, or the invite lookup failed:** "This invite link is no longer valid" with a hint to ask the admin for a new one. The Worker answers 404 for expired, used, revoked or replaced invites alike.
- **Loading:** a skeleton.
- **Loaded:** "Join {firm}", with a subtitle naming the role (staff or an admin) and the invited email in bold, then the form.

**`JoinForm` submit steps:**
1. `acceptInvite({ token, name, password })`.
2. `signInAndRecord` with the email the Worker returned, then replace-navigate to `/admin`.

Errors show `accountErrorText`. For example, `email_exists` appears when the address already has its own ResSpark account.

Tests: `join.test.tsx` (see `join.test.md`).
