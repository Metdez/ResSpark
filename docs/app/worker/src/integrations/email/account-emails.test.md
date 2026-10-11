# `app/worker/src/integrations/email/account-emails.test.ts`

- Uses a fake `EMAIL` binding (`send` is a `vi.fn` answering `{ messageId: 'msg_1' }`) with `EMAIL_FROM = notifications@valortax.test`.
- Without `EMAIL_FROM`, the result is `not_configured` and `send` is never called.
- **Invite email:** sent from `EMAIL_FROM`; the subject and text carry the raw firm name, the inviter and the link. The HTML escapes the firm name and links the URL. The expiry prints as `Oct 18, 2026`.
- **Reset email:** goes to the given address, with the link in the text and as an anchor in the HTML.
