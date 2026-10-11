# `app/worker/src/integrations/email/account-emails.ts`

The staff-account emails (invite and password reset), sent through `sendEmail` in `resend.ts`. The rules match the client-link email: plain copy, names escaped in the HTML part and raw in the text part, and one send attempt.

| Part | What it does |
|---|---|
| `DATE` | UTC formatter for `Oct 18, 2026`. |
| `message(to, subject, lines, url)` | Builds the text part (the `{link}` placeholder replaced by the raw URL) and the HTML part (each line escaped, then `{link}` replaced by an anchor whose `href` and label are the escaped URL). |
| `InviteEmailInput` | Recipient, firm name, inviter's display name, join URL and expiry. |
| `sendInviteEmail(env, input, fetchImpl?)` | Subject `Join {firm} on ResSpark`, with four lines: who invited you, the link, the expiry date, and "ignore if unexpected". |
| `sendPasswordResetEmail(env, { to, url }, fetchImpl?)` | Subject `Reset your ResSpark password`. The lines say the link works once and expires in an hour, and that ignoring the email keeps the password unchanged. |

Without `RESEND_API_KEY`, both return `{ ok: false, reason: 'not_configured' }` and make no call. The Team page then shows the link for the admin to copy.

Tests: `account-emails.test.ts` (see `account-emails.test.md`).
