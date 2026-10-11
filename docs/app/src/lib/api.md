# `app/src/lib/api.ts`

The SPA's only door to the Worker. Every call goes through `api()`, which attaches the staff bearer token, maps failures to a typed `ApiError`, and refuses any 2xx body that fails a runtime type guard (RESEARCH Code Example 4).

| Lines | What it does |
|-------|--------------|
| 1-10 | `ApiError` carries `status`, the machine `code` from the Worker's error envelope, and the human `message`. |
| 12-13 | `isObject`: a plain non-null, non-array object. The base for every guard. |
| 15-19 | `AppConfig`: the shape of `GET /api/config`. |
| 21-25 | `isConfig`: guard for `AppConfig` (`app_env` string, `logics_write_enabled` boolean, `app_name` string). |
| 27-28 | `isOk`: guard for `{ ok: true }` acknowledgement bodies. |
| 30-40 | `accessToken()`: loads `@/lib/supabase` lazily and returns the current session's `access_token`. Any failure, including the module's missing-env throw, means "no token". |
| 42-46 | `api<T>(path, init, guard)` signature. The guard decides the return type, so callers never cast. |
| 47-55 | Calls `fetch` with `content-type: application/json`, adds `authorization: Bearer <token>` only when a session exists, and lets caller headers override. |
| 56 | Parses JSON, and treats an unparseable body as `undefined` instead of throwing. |
| 57-67 | Non-2xx with the envelope `{ error: { code, message } }` throws `ApiError(status, code, message)`. Without the envelope it throws `ApiError(status, 'http_error', 'Request failed')`. |
| 68-70 | A 2xx body that fails the guard throws `ApiError(500, 'invalid_response', 'Invalid response')`. Otherwise it returns the typed body. |

## Notes

- Why the import is lazy: the deployed build has no `VITE_SUPABASE_*` until Plan 06 sets them, and `supabase.ts` throws at load. A static import would crash the whole SPA as soon as the banner mounted. The lazy import keeps public `/api/config` working, and it also keeps the Supabase bundle out of the first chunk.
- The Worker, not the SPA, enforces authorization. The token is only forwarded.

## Tests

- `api.test.ts` (co-located, `web` project; `@/lib/supabase` mocked, `fetch` stubbed):
  - bearer and content-type are sent with a session;
  - no `authorization` header is sent without one;
  - a 401 envelope maps to `ApiError` with `unauthorized`;
  - a 503 without an envelope maps to `http_error`;
  - a 2xx body that fails the guard maps to `invalid_response`.
- Written RED first (`api()` threw `not_implemented`), then GREEN.
