# `app/worker/src/integrations/logics/write-guard.ts`

The server-side demo-safety gate (D-19, PLAT-05). Every IRS Logics write in Phase 5 must call `logicsWriteGuard(env, caseId)` before touching the Logics API; the SANDBOX banner is display-only, this function is the enforcement point.

| Lines | What it does |
|-------|--------------|
| 1-4 | The rule in one place: exact-match allowlist after trim, no numeric coercion, no prefix match, empty allowlist blocks everything, `*` allows every id (added 2026-10-12 at the user's request), and the thrown error never carries the id or env values. |
| 5-8 | Signature: `env` is only the two vars it needs (`Pick<Env, …>`), `caseId` the Logics case id; returns `void` or throws. |
| 9-11 | Builds the allowlist from `LOGICS_TEST_CASE_IDS`: split on `,`, trim each entry, drop empties — so `' 12345 , 67890'` allows `12345` and `67890`. |
| 12-14 | Throws `Error('logics_write_blocked')` unless `LOGICS_WRITE_ENABLED` is exactly the string `'true'` **and** the allowlist contains `*` or the trimmed `caseId`. `'TRUE'`, `'1'`, or a prefix such as `'1234'` are all blocked; with the flag off, `*` is blocked too. |

## Notes

- Since 2026-10-12 `wrangler.jsonc` sets `LOGICS_WRITE_ENABLED=true` and `LOGICS_TEST_CASE_IDS="*"` (user request: pushes to any case). Set the flag back to `false` to stop all writes.
- Test connection (`routes/admin-integrations.ts`) lists activity types on the first allowlisted id that is not `*`; with only `*` it skips that listing.
- Callers map `logics_write_blocked` to the API error envelope; they must not append the id to the message.

## Tests

- `write-guard.test.ts` (co-located, `worker-node` project): returns for a listed trimmed id with the flag on; returns for any id with `*`; throws for flag off (including with `*`), empty allowlist, prefix id, and `TRUE`; the message equals `logics_write_blocked` exactly. Written RED first (stub returned `undefined`), then GREEN.
