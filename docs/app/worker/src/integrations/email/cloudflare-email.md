# `app/worker/src/integrations/email/cloudflare-email.ts`

All ResSpark email goes through **Cloudflare Email Service**, using the `EMAIL` `send_email` binding declared in `app/wrangler.jsonc`. That covers client-link emails (REQ-04), staff invites and password resets. There is no API key, no SDK and no new dependency; the binding is part of the Workers Paid plan (3,000 emails a month included, then $0.35 per 1,000).

Sending is best-effort. The caller always gets a result object, never an exception, and the copy-link path in the staff UI stays the primary way to reach the client.

Resend was the provider until 2026-10-11. This file was `resend.ts`, and it was renamed when the provider changed.

| Part | What it does |
|------|--------------|
| Header comment | One attempt, never retried. The link email names only the agent, the firm, the link and the expiry. Clients on the phone are primed for IRS-impersonation scams, so no case detail, amounts or tax-debt wording appear (PITFALLS M2). |
| `LinkEmailInput` | The recipient, the firm name, the agent's display name (null when unknown), the client URL, and the link expiry (ISO timestamp). |
| `SendResult` | `{ ok: true, id }` with the Email Service `messageId`, or `{ ok: false, reason }` where `reason` is `not_configured` or `send_failed`. |
| `DATE` | UTC date formatter that renders `Oct 24, 2026`. |
| `escapeHtml` | Replaces `& < > " '` with entities. Every interpolated value in an HTML part goes through it (T-02-22). |
| `compose` | Builds the link email's four sentences once for text and once for HTML (details below). |
| `EmailMessage` | One message: `to`, `subject`, `text`, `html`. |
| `EmailEnv` | The two env values a send needs: the `EMAIL` binding (narrowed to the one `send(builder)` call, so tests can pass a plain fake) and the `EMAIL_FROM` sender address. |
| `NOT_SET_UP` | The Email Service error codes meaning the sender domain is not onboarded yet: `E_SENDER_NOT_VERIFIED` and `E_SENDER_DOMAIN_NOT_AVAILABLE`. |
| `sendEmail(env, message)` | The shared sender, also used by `account-emails.ts`. Its result rules are below. |
| `sendLinkEmail(env, input)` | The client-link email: `compose(input)` plus the recipient, passed to `sendEmail`. |

**`compose` details:**
- The text part holds the raw names and URL.
- The HTML part holds the escaped firm and agent names, and a link whose `href` and label are both the escaped URL.
- The opening sentence is "`{Agent} at {Firm} needs a few things from you.`", or "`{Firm} needs a few things from you.`" with no agent.
- The subject is "`{Firm}: a few things to complete`".
- The subject and addresses are structured fields of `send()`, not raw headers, so a name cannot inject a header.

**`sendEmail` result rules:**
- No binding or an empty `EMAIL_FROM` returns `not_configured` and makes no call.
- Otherwise it makes one `env.EMAIL.send({ from: EMAIL_FROM, to, subject, text, html })` call and returns `{ ok: true, id: messageId }`.
- A thrown error whose `code` is in `NOT_SET_UP` also returns `not_configured`, so the staff UI says "Email not configured" instead of "failed".
- Any other thrown error (delivery failure, rate limit, internal error) returns `send_failed`. There is no retry, so a slow send never doubles an email.

## Setup (USER ACTION)

1. Add a domain to the Cloudflare account (DNS on Cloudflare), for example `valortax.com` or a subdomain like `mail.valortax.com`.
2. In the Cloudflare dashboard go to **Compute → Email Service → Email Sending → Onboard Domain** and pick that domain. Cloudflare adds the SPF, DKIM, DMARC and bounce records itself.
3. Set `"EMAIL_FROM"` in `app/wrangler.jsonc` `vars` to an address on that domain (for example `notifications@valortax.com`) and redeploy with `pnpm -C app run deploy:snapshot`.

Until then `EMAIL_FROM` is empty. Every email reports `not_configured`, and staff copy the link instead (Email link button, Settings → Team invite and reset links).

## Tests

`app/worker/src/integrations/email/cloudflare-email.test.ts` (see `cloudflare-email.test.md`).
