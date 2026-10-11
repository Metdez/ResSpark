# `app/src/features/client-link/invalid-link-page.tsx`

`InvalidLinkPage`: the SPA copy of the "link not active" message, shown at `/c/$token` (UI-SPEC S6) and, since Plan 02-08, by `PortalPage` at `/c/` whenever the client has no valid session (D-13: a missing cookie, an expired link, or a revoke).

- Deployed, `/c/<token>` is answered by the Worker first (`run_worker_first`), which serves its own static 404 page. The SPA route renders only after in-app navigation, or in local dev when the Worker is bypassed.
- Inside `ClientShell` with `firmName` = `VITE_APP_NAME` (fallback `ResSpark`): heading "This link isn't active" and body "It may have expired or been replaced with a new one. Ask your agent for a new link."
- `BODY` keeps the body sentence in one string constant so it stays greppable and word-for-word identical to `INVALID_LINK_HTML` in `app/worker/src/routes/client-link-pages.ts` (PORT-06). Change both together.
- No button and no link: the only fix is a new link from the agent.

## Tests

`invalid-link-page.test.tsx` (renamed from `no-link-page.test.tsx` in Plan 02-08) keeps four cases: the copy ("This link isn't active" and "Ask your agent for a new link."), no admin chrome (`nav`, `aside`, `data-sidebar`), `document.title` set to the firm name, and the robots `noindex` meta. `portal-page.test.tsx` checks that a 401 from `/api/c/state` or from Start renders this page.
