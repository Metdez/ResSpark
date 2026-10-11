# `app/src/features/settings/team/team-page.tsx`

The Settings → Team page (`/admin/settings/team`). It is wrapped in `ContentSection` ("Team · People who can sign in to your firm's ResSpark.").

| Part | What it does |
|---|---|
| `roleLabel` | `Admin` / `Staff`. |
| `MemberRow` | One member (rendered with `data-member=<user id>`); its contents are listed below. |
| `Invites` | The "Pending invites" card, shown only when there are open invites (admins only); its rows are listed below. |
| `TeamPage` | Loads `getTeam`, then renders, in order: `InviteCard` (admins), `Invites`, and the "Members" card. The Members description tells admins what they can do and tells staff to ask an admin. A skeleton shows while loading. |

**`MemberRow` contents:**
- The name, with "(you)" on your own row.
- The email.
- A role badge (filled for admins).
- "Last sign-in {date}" or "Never signed in".
- For admins, on rows other than their own, a "Copy reset link" button. It calls `memberResetLink` and copies the URL with the toast "Reset link for {name} copied. It works once, for one hour."

**`Invites` rows** (`data-invite=<id>`): email, role badge, "Expires {date}", and a "Revoke" button. A revoke shows the toast "Invite revoked" and refreshes `TEAM_KEY`.

Tests: `team-page.test.tsx` (see `team-page.test.md`).
