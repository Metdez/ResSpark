# `app/src/features/client-link/no-link-page.tsx`

`NoLinkPage`: what a client sees at `/c/` (UI-SPEC S6). The Worker redirects a valid link here after setting the `rs_client` cookie, and anyone who opens `/c/` directly lands here too.

- `firmName` is `VITE_APP_NAME`, falling back to `ResSpark`. There is no client session API in Phase 1, so the page cannot show the real firm or agent yet.
- Inside `ClientShell`: a centered block with the 48 px Lucide `Inbox` icon (muted, hidden from screen readers), the heading "Nothing to do yet", and the body "Your agent will send you a link when there's something for you to complete. You can close this page."
- No button. The page cannot read the HttpOnly cookie, so it shows the same honest copy whether or not the client arrived through a valid link (UI-SPEC A-8). Phase 2 replaces it with the real checklist.

## Tests

`no-link-page.test.tsx`: copy, no admin chrome, tab title, robots meta.
