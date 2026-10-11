# `app/worker/src/integrations/email/resend.ts`

Sends the client link by email through Resend over plain `fetch` (D-09, REQ-04). No SDK and no new dependency. Sending is best-effort: the caller always gets a result object, never an exception, and the copy-link path in the staff UI stays the primary way to reach the client.

| Lines | What it does |
|-------|--------------|
| 1-2 | Module rule: one attempt, never retried, and the copy names only the agent, the firm, the link, and the expiry. Clients on the phone are primed for IRS-impersonation scams, so no case detail, amounts, or tax-debt wording appear (PITFALLS M2). |
| 4-10 | `LinkEmailInput`: the recipient, the firm name, the agent's display name (null when unknown), the client URL, and the link expiry (ISO timestamp). |
| 12 | `SendResult`: `{ ok: true, id }` with the Resend email id, or `{ ok: false, reason }` where `reason` is `not_configured` (no API key) or `send_failed` (Resend refused, the network failed, or the 8-second timeout fired). |
| 14-16 | The Resend endpoint, the default sender `onboarding@resend.dev` (until a domain is verified it only delivers to the Resend account owner), and a UTC date formatter that renders `Oct 24, 2026`. |
| 18-19 | `escapeHtml`: replaces `& < > " '` with entities. Every interpolated value in the HTML part goes through it (T-02-22). |
| 21-39 | `compose`: builds the four sentences once for text and once for HTML. The text part holds the raw names and URL. The HTML part holds the escaped firm and agent names and a link whose `href` and label are both the escaped URL. The opening sentence is "`{Agent} at {Firm} needs a few things from you.`", or "`{Firm} needs a few things from you.`" with no agent. The subject is "`{Firm}: a few things to complete`". The subject is a JSON field, not a raw header, so the firm name cannot inject one. |
| 41-46 | `sendLinkEmail`: takes only the two env values it needs (`RESEND_API_KEY` is an optional secret that is not in `secrets.required`) and an injectable `fetchImpl` for tests. With no key it returns `not_configured` and makes no call. |
| 47-55 | One `POST` with `Authorization: Bearer <key>` and a JSON body `{ from, to: [recipient], subject, html, text }`. `RESEND_FROM` overrides the sender when it is non-empty. |
| 56-58 | A non-2xx answer, or a 2xx answer without a string `id`, is `send_failed`. Nothing from the response body is thrown or returned. |
| 59-61 | A thrown fetch (network error or timeout) is also `send_failed`. There is no retry, so a slow Resend never doubles an email. |

## Setup (USER ACTION)

Create a Resend API key, then run `pnpm -C app wrangler secret put RESEND_API_KEY` and enter the value over stdin. To send to real clients, verify a sending domain in Resend and set `RESEND_FROM` in the `app/wrangler.jsonc` vars. Until then the email action reports `not_configured`.

## Tests

`app/worker/src/integrations/email/resend.test.ts`.
