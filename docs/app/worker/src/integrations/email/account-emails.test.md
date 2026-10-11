# `app/worker/src/integrations/email/account-emails.test.ts`

- Without a key, the result is `not_configured` and `fetch` is never called.
- **Invite email:** the subject and text carry the raw firm name, the inviter and the link. The HTML escapes the firm name and links the URL. The expiry prints as `Oct 18, 2026`.
- **Reset email:** goes to the given address, with the link in the text and as an anchor in the HTML.
