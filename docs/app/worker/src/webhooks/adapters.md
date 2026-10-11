# `app/worker/src/webhooks/adapters.ts`

The registry `POST /api/webhooks/:provider` looks up: `{ plaid: plaidAdapter, truv: truvAdapter, docuseal: docusealAdapter }` (DocuSeal added in Plan 06-04, `webhooks/docuseal.ts`). A provider not listed answers 404. The route only reads own keys (`Object.hasOwn`), so `constructor` or `__proto__` can never resolve to an adapter.
