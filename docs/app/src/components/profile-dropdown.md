# `app/src/components/profile-dropdown.tsx`

Header avatar button with the account menu. Forked; only the menu items changed (Profile/Billing/
Settings/New Team -> Appearance).

| Lines | What it does |
|-------|--------------|
| 1-15 | Router `Link`, dialog-state hook, `Avatar`, `Button`, dropdown-menu parts, `SignOutDialog`. |
| 17-18 | Component and the sign-out dialog open state. |
| 22-30 | Trigger: 32 px ghost button with the avatar (image + `SN` fallback). |
| 31-39 | Menu header: display name and email. |
| 40-45 | One item **Appearance** -> `/admin/settings/appearance`. |
| 46-53 | Destructive **Sign out** item (shortcut hint) that opens the dialog. |
| 56-58 | The `SignOutDialog`. |

## Known stub

- Lines 26-27 and 34-36 still show the fork's placeholder avatar path and `satnaing` / `satnaingdev@gmail.com`. Plan 06 replaces them with the signed-in staff user; tracked in the Plan 02 SUMMARY.
