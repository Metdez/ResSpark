# `app/src/features/client-portal/sign/sign-page.test.tsx`

Web project (jsdom), using the `query-render` harness. `@tanstack/react-router` is mocked (`useNavigate` returns a spy, `Link` renders `<a href>`). `@docuseal/react` is **not** mocked: jsdom never fetches `form.js`, so the real wrapper renders a bare `<docuseal-form>` whose `data-*` attributes are the contract with DocuSeal's script, and dispatching a `completed` event on it calls `onComplete` exactly as the browser would.

`render(replies)` fills default replies (state, heartbeat, consents, reconcile) into the caller's table **in place**. The harness reads the table on every call, so a test can change what the next `signature/start` returns.

Cases (15):

1. 409 `consent_required` opens "Before you sign" with five list items and "ValorTax keeps a record"; no embed.
2. `I agree` posts `{ kind: 'esign', text_version: 'esign-v1' }`, starts a second time, and renders the embed with the mocked `data-src`.
3. The embed carries the D-13 attributes: `with-title`, `with-send-copy-button`, `send-copy-email`, `allow-to-resubmit` false; `only-required-fields`, `expand`, `go-to-last`, `allow-typed-signature` true; `language` `en`; `custom-css` with `font-size:16px`.
4. `Not now` navigates to `/c`.
5. 409 `consent_text_stale` keeps the sheet with "Please read and agree again.".
6. to 8. 503 `provider_not_configured`, `template_not_mapped`, `template_invalid` each show the not-configured copy, one Back link in `main`, no embed, and no sheet.
9. `signed: true` shows the already-signed copy.
10. 409 `item_approved` shows the already-signed copy.
11. A 401 shows the invalid-link page.
12. 502 shows the error copy; `Try again` starts again and renders the embed.
13. A `completed` event posts the reconcile call and navigates to `/c` with `search: { signed: 'I1' }`.
14. The header link reads "Back to your steps", is `min-h-11`, and points at `/c`; the root is `min-h-dvh`; the loading copy shows.
15. The heartbeat posts `last_step: 'signature'`.
