# `app/worker/src/integrations/logics/write-guard.ts`

The server-side demo-safety gate (D-19, PLAT-05). Every IRS Logics write in Phase 5 must call `logicsWriteGuard(env, caseId)` before touching the Logics API; the SANDBOX banner is display-only, this function is the enforcement point.

| Lines | What it does |
|-------|--------------|
| 1-3 | The rule in one place: exact-match allowlist after trim, no numeric coercion, no prefix match, empty allowlist blocks everything, and the thrown error never carries the id or env values. |
| 4-7 | Signature: `env` is only the two vars it needs (`Pick<Env, …>`), `caseId` the Logics case id; returns `void` or throws. |
| 8-10 | Builds the allowlist from `LOGICS_TEST_CASE_IDS`: split on `,`, trim each entry, drop empties — so `' 12345 , 67890'` allows `12345` and `67890`. |
| 11-13 | Throws `Error('logics_write_blocked')` unless `LOGICS_WRITE_ENABLED` is exactly the string `'true'` **and** the trimmed `caseId` is a member. `'TRUE'`, `'1'`, or a prefix such as `'1234'` are all blocked. |

## Notes

- Defaults in `wrangler.jsonc` are `LOGICS_WRITE_ENABLED=false` and an empty allowlist, so a fresh deploy can never write to Logics.
- Callers map `logics_write_blocked` to the API error envelope; they must not append the id to the message.

## Tests

- `write-guard.test.ts` (co-located, `worker-node` project): returns for a listed trimmed id with the flag on; throws for flag off, empty allowlist, prefix id, and `TRUE`; the message equals `logics_write_blocked` exactly. Written RED first (stub returned `undefined`), then GREEN.
