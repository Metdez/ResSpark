# `app/src/features/client-portal/intake/intake-api.test.ts`

Unit tests for `intake-api.ts` (project `web`). `reply(status, body)` stubs `fetch` with one response.

- `getIntake` returns the state and calls `/api/c/intake` with the same-origin cookie.
- `isIntakeState` accepts a valid state and rejects a prefill source other than `truv`/`logics` and a non-primitive answer.
- `saveAnswer('household_size', 3)` sends a `PUT` with the `X-Requested-With: ResSpark` header and body `{ question_id, value }`.
- `finishIntake` turns a 400 `incomplete` into `PortalError(400, 'incomplete')`.
