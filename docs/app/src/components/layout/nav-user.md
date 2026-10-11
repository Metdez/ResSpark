# `app/src/components/layout/nav-user.tsx`

Sidebar footer showing the signed-in user with a dropdown (Appearance, Sign out). Forked; the
Pro/Account/Billing/Notifications items are gone and the component renders nothing without a user.

| Lines | What it does |
|-------|--------------|
| 1-21 | Router `Link`, three Lucide icons, the dialog-state hook, `Avatar`, dropdown-menu and sidebar parts, `SignOutDialog`, the `User` type. |
| 23-25 | Props: optional `user`. |
| 27-32 | Reads sidebar mobile state and the dialog open state; returns `null` when there is no user (no fake data before Plan 06 wires the session). |
| 34-60 | Trigger: avatar, name and email (`truncate` + `title`), chevron. |
| 61-91 | Dropdown: header repeats avatar/name/email; one item **Appearance** -> `/admin/settings/appearance`; destructive **Sign out** opens the dialog. |
| 97-102 | The `SignOutDialog` controlled by `open`. |

## Notes

- Plan 06 passes the Supabase user (display name from `staff_profiles`, email from the JWT).
