# `app/worker/src/integrations/email/cloudflare-email.test.ts`

Unit tests for `sendEmail` and `sendLinkEmail`. They run in the `worker-node` Vitest project with a fake `EMAIL` binding, so nothing leaves the machine.

## Setup

- `INPUT` uses the firm name `Valor <b>Tax</b>` to prove escaping, the agent `Andrew`, and an expiry of 2026-10-24.
- `binding(fail?)` is a fake Email Service binding. Its `send` is a `vi.fn` that records the message and answers `{ messageId: 'msg_1' }`, or throws `fail`.
- `envWith(email)` pairs it with `EMAIL_FROM = notifications@valortax.test`.
- `coded(code)` builds an `Error` with a `code` property, the way the real binding throws.

## Cases

- **Not set up:** no `EMAIL_FROM`, an empty `EMAIL_FROM`, or no binding each return `not_configured`, and `send` is never called.
- **Happy path:** one `send` call from `EMAIL_FROM` to the recipient, with the firm name in the subject. Returns `{ ok: true, id: 'msg_1' }`.
- **Domain not onboarded:** `E_SENDER_NOT_VERIFIED` and `E_SENDER_DOMAIN_NOT_AVAILABLE` return `not_configured`.
- **Failures:** `E_DELIVERY_FAILED` returns `send_failed` after exactly one call (no retry), and a plain thrown `TypeError` also returns `send_failed`.
- **Escaping:** the HTML part holds `Valor &lt;b&gt;Tax&lt;/b&gt;` and no `<b>`. The text part holds the raw name, the agent, the URL and `Oct 24, 2026`. The HTML link is `<a href="https://x/c/tok">`.
- **Safe copy:** neither part contains `tax debt`, `IRS`, `$` or `case` (M2).
- **No agent:** the text opens with `Valor <b>Tax</b> needs a few things from you.`
