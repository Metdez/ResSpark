# `app/worker/src/middleware/staff-auth.ts`

The `staffAuth` Hono middleware: the server-side gate for every `/api/admin/*` route (D-15, D-16, RESEARCH Pattern 2 "verify-then-scope"). The SPA's route guard is UX only; this is the real authority.

| Lines | What it does |
|-------|--------------|
| 1-4 | `createMiddleware` (typed middleware), `HTTPException` (turned into the `{ error: { code, message } }` envelope by `app.onError` in `index.ts`), `verifyStaffJwt`, and `getStaffProfile`. |
| 6-12 | `StaffCtx`, the request-scoped identity: `userId` (JWT `sub`), `firmId` and `role` (from `staff_profiles`), `displayName` (from `staff_profiles`), and `email` (from the JWT). `index.ts` imports this type for its `Variables`. |
| 14-17 | `staffAuth` is typed with `Bindings: Env` and sets the `staff` variable. |
| 18-19 | Idempotence guard: when an earlier `staffAuth` on the same request already set `staff`, the middleware continues without verifying again. Sub-apps that share a prefix (`admin-requests.ts` and `admin-request-actions.ts` at `/api/admin/requests`) each declare `staffAuth`, and Hono runs both middlewares on the action paths. Only this middleware sets `staff`, so the guard cannot be bypassed from the request. |
| 20 | Reads the `authorization` header and strips `Bearer ` case-insensitively. The header value is never logged. |
| 21 | No token → `HTTPException(401, 'unauthorized')`. |
| 22-24 | Verifies the token; any verification failure becomes the same 401, so a caller cannot tell a forged token from an expired one. |
| 25 | Loads the profile by the verified `sub` with the per-request admin client. |
| 26-28 | No profile, or a profile whose `firm_id` differs from the JWT's `app_metadata.firm_id` → `HTTPException(403, 'forbidden')` (T-01-26). Claims and the table must agree. |
| 29-35 | Sets `c.var.staff`. `firmId` and `role` come from the profile row, so a stale claim cannot raise a role. The logger reads `staff.firmId`/`staff.userId` for its `firm_id`/`actor_id` fields. |
| 36 | Continues to the route. |

## Rules for later routes

- Mount with `.use('*', staffAuth)` on the route's own Hono instance (see `routes/admin-session.ts`).
- Never read `firm_id`, `actor_id`, `role`, or `user_id` from a body, query string, or other header. Use `c.var.staff`.

## Tests

`app/worker/test/auth.test.ts`: missing, malformed, foreign-key, wrong-issuer and wrong-audience tokens → 401; no profile and cross-firm profile → 403; the 401 log line carries `error_code: 'unauthorized'` and never the header.
