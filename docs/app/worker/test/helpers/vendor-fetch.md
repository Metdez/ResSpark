# `app/worker/test/helpers/vendor-fetch.ts`

`stubVendorFetch(routes)`: replaces global `fetch` (`vi.stubGlobal`) with a router.

- A route matches on `host`, `path` (exact string or RegExp on the pathname) and optional `method`; its `respond(req)` builds the vendor response.
- A matched request is cloned into `calls` (in order), so tests can assert URL, method, headers and body.
- Anything that matches no route goes to the original `fetch`, so live Supabase calls in the same test still reach the real project.
- `restore()` calls `vi.unstubAllGlobals()`.

Used by `connections-tracer.test.ts` (Truv order read) and the Plaid key-fetch tests.
