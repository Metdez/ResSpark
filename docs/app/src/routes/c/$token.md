# `app/src/routes/c/$token.tsx`

File route for `/c/$token`. Renders `InvalidLinkPage` from `features/client-link/invalid-link-page.tsx`.

- On the deployed app this route almost never renders: `/c/*` is in `run_worker_first`, so the Worker answers `GET /c/<token>` itself, with the 302 exchange or its static 404 page. The SPA route is reached only by in-app navigation or in local dev when the Worker is bypassed.
- It never reads, validates or displays the `token` param. The SPA cannot judge a token, so it shows the same "This link isn't active" message the Worker uses.
- Like `c/index.tsx`, it has no admin ancestor and must not import from `@/components/layout`, `@/features/auth` or `@/features/dashboard`.
