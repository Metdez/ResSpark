# `app/worker/src/webhooks/adapters.ts`

The registry `POST /api/webhooks/:provider` looks up: `{ truv: truvAdapter, plaid: plaidAdapter }`. A provider not listed answers 404. DocuSeal joins in Phase 6 by adding one line. The route only reads own keys (`Object.hasOwn`), so `constructor` or `__proto__` can never resolve to an adapter.
