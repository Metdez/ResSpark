# `app/src/features/settings/team/team-page.test.tsx`

Supabase and `sonner` are mocked; `fetch` answers from the table.

- **Admin view:**
  - Members show, with "(you)" and "Never signed in".
  - The pending invite shows.
  - The invite card shows.
  - Your own row has no "Copy reset link" button; Sam's row does.
- **Staff view:** no invite card and no reset buttons.
- **Inviting:** posts `{ email, role: 'staff' }`, shows "Invite ready for …", the "Email isn't set up yet" line and the link.
- **409 `already_member`:** explained inline, with no error toast.
