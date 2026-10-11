# `app/worker/src/webhooks/docuseal.ts`

The DocuSeal webhook verifier served by `POST /api/webhooks/docuseal` (Phase 4 route, Plan 06-04, D-18, WEBH-01).

## Exports

- `DocusealEvent`: `{ event_type, timestamp, data: { id, submission_id } }`. In form events `data.id` is the **submitter** id; `data.submission_id` is what the connection stores as `external_id`.
- `isDocusealEvent(v)`: true only for `form.viewed`, `form.started`, `form.completed` and `form.declined` with a string `timestamp` and integer `data.id` and `data.submission_id`. `submission.*` and `template.*` events are rejected (they are not routed).
- `docusealAdapter`:
  - `id`: `'docuseal'`.
  - `configured(env)`: `Boolean(env.DOCUSEAL_WEBHOOK_SECRET)`. The route answers 401 `invalid_signature` when it is missing.
  - `verify(raw, headers, env)`:
    1. Reads `x-docuseal-signature` and splits it once on the first `.` into `ts` and `hex`. `ts` must be digits and `hex` exactly 64 hex characters, else `null`.
    2. `|now - ts| > 300` seconds → `null` (stale or future-dated replay).
    3. Imports the secret as an HMAC SHA-256 key with the `verify` usage and calls `crypto.subtle.verify('HMAC', key, bytes(hex), utf8("<ts>.<raw>"))`.
    4. Only after the MAC verifies, `JSON.parse(raw)` inside try/catch (bad JSON → `null`, no throw) and `isDocusealEvent`.
    5. Returns `{ payload, iat: Number(ts) }`.
  - `eventKey(v)`: `<event_type>:<data.id>:<timestamp>`, the `webhook_events.event_key` (unique per provider, so a redelivery is a 200 no-op).

## Secret and constant time

DocuSeal's signing secret is the `whsec_…` string, used as the raw key bytes as-is (RESEARCH § Q2 HMAC). The adapter does not reuse the Truv adapter's `timingSafeEqual` comparison: `crypto.subtle.verify` already compares in constant time, needs no hex re-encoding, and runs in both Workers and the `worker-node` tests (RESEARCH Pitfall 6).

## What it never does

- Parse or re-serialize the body before the MAC verifies.
- Set any status: the consumer routes by `data.submission_id` and `reconcileSignature` re-reads `GET /submissions/{id}` (D-19).

## Tests

`docuseal.test.ts`: a signed body verifies with the expected `eventKey`; an appended byte, 301 s old, 301 s in the future, no dot, 63 hex characters, non-hex, a missing header, another secret, `submission.created`, a missing `submission_id`, and a signed non-JSON body all return `null`; 299 s old verifies; `configured` is false with an empty secret. `test/esign-complete.test.ts` proves the route live.
