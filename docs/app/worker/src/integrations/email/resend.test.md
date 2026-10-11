# `app/worker/src/integrations/email/resend.test.ts`

Unit tests for `sendLinkEmail`. They run in the `worker-node` Vitest project with an injected `fetch` stub, so nothing leaves the machine.

## Setup

- `ENV` holds a test API key and the default sender. `INPUT` uses the firm name `Valor <b>Tax</b>` to prove escaping, the agent `Andrew`, and an expiry of 2026-10-24.
- `stub()` wraps a response factory in a `vi.fn` typed as `fetch`. `ok()` answers 200 `{ id: 'em_1' }`. `sentBody()` parses the JSON body of the first call.

## Cases

- **No key:** returns `not_configured` and the stub is never called.
- **Happy path:** returns `{ ok: true, id: 'em_1' }`. It checks the URL `https://api.resend.com/emails`, `POST`, `authorization: Bearer re_x`, `content-type: application/json`, the sender, the one-element `to` array, and a subject that holds the firm name. The `result.ok` assertion comes first so a failure reports on one line.
- **Escaping:** the HTML part holds `Valor &lt;b&gt;Tax&lt;/b&gt;` and no `<b>`. The text part holds the raw name, the agent, the URL, and `Oct 24, 2026`. The HTML link is `<a href="https://x/c/tok">`.
- **Safe copy:** neither part contains `tax debt`, `IRS`, `$`, or `case` (M2).
- **Failures:** a 422 answer and a thrown network error both return `send_failed`, and the thrown case shows exactly one call (no retry).
- **No agent:** the text opens with `Valor <b>Tax</b> needs a few things from you.`
- **Empty `RESEND_FROM`:** falls back to `onboarding@resend.dev`.
