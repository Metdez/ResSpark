# `app/src/components/profile-dropdown.tsx`

Header avatar button with the account menu (UI-SPEC Copywriting Contract, "Profile dropdown"). Forked; since Plan 06 it shows the signed-in staff member instead of the fork's placeholder user.

| Lines | What it does |
|-------|--------------|
| 1-15 | Router `Link`, the dialog-state hook, `useStaffLabel`, `Avatar`/`AvatarFallback`, `Button`, dropdown-menu parts, and `SignOutDialog`. |
| 17-19 | The sign-out dialog state and `useStaffLabel()` (display name, email, avatar initial). |
| 24-34 | Trigger: a 32 px round ghost button with the initial. It is icon-only, so it carries `aria-label="Account menu"`; `title` shows the name (or email) on hover. |
| 36-44 | Header: `display_name` in the Heading role at 16 px (600) and the email muted below. `break-all` wraps long values instead of truncating. Until the session query resolves, only the email shows. |
| 46-50 | **Appearance** → `/admin/settings/appearance`. |
| 52-54 | **Sign out** opens the dialog. Not destructive, and the fork's fake `⇧⌘Q` hint is gone (no such shortcut exists). |
| 58 | The `SignOutDialog`. |
