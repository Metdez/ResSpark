# `app/src/components/layout/nav-user.tsx`

Sidebar footer showing the signed-in staff member, with a menu (Appearance, Sign out). Forked; the Pro/Account/Billing/Notifications items are gone, and since Plan 06 the user comes from the Worker-verified session instead of a prop.

| Lines | What it does |
|-------|--------------|
| 1-21 | Router `Link`, three Lucide icons, the dialog-state hook, `useStaffLabel`, `Avatar`/`AvatarFallback`, dropdown-menu and sidebar parts, and `SignOutDialog`. |
| 23-27 | Reads sidebar mobile state and the dialog state, then `useStaffLabel()`: `display_name` from `useSession()` (`GET /api/admin/session`), the email, and the avatar initial. |
| 29 | Renders nothing until there is at least an email, so no fake data ever shows. |
| 41-43 | Avatar with the initial (no image; staff photos are not stored). |
| 44-56 | Display name (Label 600) and email (muted). Both `truncate` in the 256 px sidebar with the full text in `title`. While the session query loads, or if the profile is unavailable, only the email shows. |
| 60-76 | Dropdown header: avatar, name, and email. `break-all` lets long values wrap instead of truncating. |
| 78-85 | **Appearance** → `/admin/settings/appearance`. |
| 87-90 | **Sign out** opens the dialog. It is not styled as destructive: signing out loses nothing. |
| 96 | The `SignOutDialog`, controlled by `open`. |

## Notes

- `app-sidebar.tsx` renders `<NavUser />` with no props.
