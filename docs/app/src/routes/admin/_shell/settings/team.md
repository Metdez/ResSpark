# `app/src/routes/admin/_shell/settings/team.tsx`

File route for `/admin/settings/team`. It renders `TeamPage` from `app/src/features/settings/team/team-page.tsx` inside the Settings layout (`settings/route.tsx`).

- It is behind the `_shell` sign-in guard.
- Any staff member can open it and see the member list. Invites, revokes and reset links are admin-only, and the Worker enforces that (`worker/src/routes/admin-team.ts`).
