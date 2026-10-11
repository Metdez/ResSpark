# `app/src/features/settings/team/invite-card.tsx`

The "Invite a teammate" card on Settings → Team, shown to admins only.

| Part | What it does |
|---|---|
| `INLINE` | Codes this card explains under the form: `invalid_email` and `already_member` ("That person is already on your team."). Every other error goes to the app-wide handler through `unlessHandled`. |
| `EMAIL_STATUS` | One sentence per `email_status`: sent, `not_configured` ("Email isn't set up yet… copy the link and send it yourself"), or `send_failed`. |
| Form | An email input, a role `Select` (Staff/Admin, default Staff) and "Send invite", which is disabled while pending or when the email is blank. Submitting clears the last result and calls `inviteMember`. |
| On success | Keeps the created invite, clears the email field and refreshes `TEAM_KEY`. |
| Result `Alert` | "Invite ready for {email}", the email-status sentence, the full link in a `code` block (selectable when the clipboard is blocked), and "Copy invite link". |

The card description says invite links expire after 7 days (`INVITE_TTL_DAYS` in the Worker).
