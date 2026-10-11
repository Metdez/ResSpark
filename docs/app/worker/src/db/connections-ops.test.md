# `app/worker/src/db/connections-ops.test.ts`

Unit tests for `projectSummary`, the pure half of the staff read model. They use canned rows and a fixed `now` of 2026-10-11, so the six target months run from Sep 2026 back to Apr 2026. The queries that feed `projectSummary` are covered live in `app/worker/test/connections-ops-live.test.ts`.

| Test | Proves |
|------|--------|
| six months, newest first | Stored cells keep their status and `document_id`. Months with no stored row come back as `missing` with `document_id: null`. |
| outside the window | A stored month older than the window is ignored. |
| account order | Accounts are sorted by `mask` ascending, then `id`, with null masks last. |
| update status | `HISTORICAL_UPDATE_COMPLETE` maps to `historical`, `INITIAL_UPDATE_COMPLETE` to `initial`, and `NOT_READY` to `not_ready`. A value already in lowercase form passes through. An absent value maps to `null`. |
| capabilities, no leaks | `capabilities` comes from `PROVIDER_CAPABILITIES`. The serialised summary never contains `return_nonce`, `sync_cursor`, `link_ref`, or `external_id`. |
| error | Only `code` and a string `message` are kept. Any extra vendor fields are dropped. |
| employers | Each employer gets its documents from the payroll storage group whose name ends in `-<employer_id>`, with counts of `pay_stub`, `w2`, and `income_report`. A Truv connection has `capabilities: null`. An employer with no documents gets zero counts. |
