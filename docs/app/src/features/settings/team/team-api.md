# `app/src/features/settings/team/team-api.ts`

Client calls and response guards for the Team API (`worker/src/routes/admin-team.ts`).

| Export | What it does |
|---|---|
| `Role` | `staff` or `admin`. |
| `TeamMember` | `user_id`, `display_name`, `role`, `email` (nullable), `last_sign_in_at` (nullable), `created_at`. |
| `TeamInvite` | Open invite: `id`, `email`, `role`, `created_at`, `expires_at`. |
| `Team` / `isTeam` | `GET /api/admin/team` body: `members`, `invites`, `can_manage`, `you`. Every member and invite is checked by its own guard. |
| `CreatedInvite` | The invite answer plus `url` and `email_status` (`sent`, `not_configured` or `send_failed`). Checked by the private `isCreatedInvite`. |
| `TEAM_KEY` | React Query key `['team']`, invalidated after an invite or a revoke. |
| `getTeam()` | `GET /api/admin/team`. |
| `inviteMember({ email, role })` | `POST /api/admin/team/invites`. |
| `revokeInvite(id)` | `DELETE /api/admin/team/invites/:id`. |
| `memberResetLink(userId)` | `POST /api/admin/team/members/:userId/reset-link` → `{ url }`. |
